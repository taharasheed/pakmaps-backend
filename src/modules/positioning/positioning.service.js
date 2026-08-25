const { Op } = require('sequelize');
const { RadioPlace, WifiSignature, CellSignature, RadioObservation, WifiObservation, CellObservation, AnchorEvidence, DeviceTrust, RadioInferredTrajectory, sequelize } = require('../../db/models');
const { normalizeBssid, isLocallyAdministered, isBroadcastOrMulticast, tokenizeBssid } = require('../../utils/bssid');
const AppError = require('../../utils/AppError');

const MATCHER_VERSION = 'radio-v1.0.0';
const MAX_OBSERVATION_AGE_MS = 2 * 60 * 1000;
const MAX_ANCHOR_AGE_MS = 10 * 1000;
const ANCHOR_MAX_ACCURACY_M = 25;
const RUNNER_UP_MARGIN_MIN = 0.15;

// Sources that must never teach the map - see design doc section 3.2 / 9.
// A position derived from our own (or anyone else's) radio matching can
// never be used as evidence to train that same matching.
const DISALLOWED_ANCHOR_SOURCES = new Set([
  'local_radio',
  'backend_radio',
  'beacondb',
  'opencellid',
  'cell_viewport_hint',
  'cached_position',
  'approximate_position',
]);

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Welford's online algorithm - lets mean/stddev update per-sample without
// keeping the full RSSI history around.
function welfordUpdate(mean, m2, count, value) {
  const newCount = count + 1;
  const delta = value - mean;
  const newMean = mean + delta / newCount;
  const delta2 = value - newMean;
  const newM2 = m2 + delta * delta2;
  return { mean: newMean, m2: newM2, count: newCount };
}

function normalizeWifiList(rawList, capturedAtMs) {
  const seen = new Map();
  for (const w of rawList) {
    if (w.ageMs > MAX_OBSERVATION_AGE_MS) continue;
    const normalized = normalizeBssid(w.bssid);
    if (!normalized) continue;
    if (isBroadcastOrMulticast(normalized) || isLocallyAdministered(normalized)) continue;
    const existing = seen.get(normalized);
    if (!existing || w.ageMs < existing.ageMs) {
      const { token, tokenKeyVersion } = tokenizeBssid(normalized);
      seen.set(normalized, { ...w, normalizedBssid: normalized, bssidToken: token, tokenKeyVersion });
    }
  }
  return [...seen.values()]
    .sort((a, b) => (b.connected === a.connected ? b.rssiDbm - a.rssiDbm : b.connected - a.connected))
    .slice(0, 50);
}

function normalizeCellList(rawList) {
  return rawList.filter((c) => c.ageMs <= MAX_OBSERVATION_AGE_MS && c.area != null && c.cellId != null).slice(0, 10);
}

async function retrieveCandidatePlaceIds(wifi, cells) {
  if (wifi.length) {
    const tokens = wifi.map((w) => w.bssidToken);
    const rows = await WifiSignature.findAll({ where: { bssidToken: { [Op.in]: tokens }, unstable: false } });
    if (rows.length) return { source: 'wifi', placeIds: [...new Set(rows.map((r) => r.placeId))] };
  }
  if (!cells.length) return { source: 'none', placeIds: [] };

  const exact = cells.map((c) => ({ radio: c.radio, mcc: c.mcc, mnc: c.mnc, area: c.area, cellId: c.cellId }));
  const exactRows = await CellSignature.findAll({ where: { [Op.or]: exact } });
  if (exactRows.length) return { source: 'cell_exact', placeIds: [...new Set(exactRows.map((r) => r.placeId))] };

  const areaClauses = cells.map((c) => ({ mcc: c.mcc, mnc: c.mnc, area: c.area }));
  const areaRows = await CellSignature.findAll({ where: { [Op.or]: areaClauses } });
  if (areaRows.length) return { source: 'cell_area', placeIds: [...new Set(areaRows.map((r) => r.placeId))] };

  const carrierClauses = cells.map((c) => ({ mcc: c.mcc, mnc: c.mnc }));
  const carrierRows = await CellSignature.findAll({ where: { [Op.or]: carrierClauses } });
  if (carrierRows.length) return { source: 'cell_carrier', placeIds: [...new Set(carrierRows.map((r) => r.placeId))] };

  return { source: 'none', placeIds: [] };
}

// Simplified version of the point model in design doc section 7.3. Real
// tuning (RSSI-pattern similarity, per-signature staleness weighting, etc.)
// is deliberately left for once shadow-mode data exists to tune against.
async function scoreCandidates(placeIds, wifi, cells) {
  if (!placeIds.length) return [];
  const [wifiSigRows, cellSigRows] = await Promise.all([
    WifiSignature.findAll({ where: { placeId: { [Op.in]: placeIds } } }),
    CellSignature.findAll({ where: { placeId: { [Op.in]: placeIds } } }),
  ]);

  const connected = wifi.find((w) => w.connected);
  const wifiTokens = new Set(wifi.map((w) => w.bssidToken));
  const freshWifiTokens = new Set(wifi.filter((w) => w.ageMs <= 30000).map((w) => w.bssidToken));

  const scores = placeIds.map((placeId) => {
    const placeWifiSigs = wifiSigRows.filter((r) => r.placeId === placeId);
    const placeCellSigs = cellSigRows.filter((r) => r.placeId === placeId);
    const matchingSigs = placeWifiSigs.filter((r) => wifiTokens.has(r.bssidToken));
    const freshMatchingCount = matchingSigs.filter((r) => freshWifiTokens.has(r.bssidToken)).length;
    const connectedMatch = connected ? placeWifiSigs.some((r) => r.bssidToken === connected.bssidToken) : false;
    const missing = Math.max(0, placeWifiSigs.length - matchingSigs.length);

    const exactCellMatch = cells.some((c) => placeCellSigs.some((s) => s.radio === c.radio && s.mcc === c.mcc && s.mnc === c.mnc && s.area === c.area && String(s.cellId) === String(c.cellId)));
    const neighbouringCellMatches = cells.filter((c) => placeCellSigs.some((s) => s.mcc === c.mcc && s.mnc === c.mnc && s.area === c.area && String(s.cellId) !== String(c.cellId))).length;
    const sameTac = cells.some((c) => placeCellSigs.some((s) => s.mcc === c.mcc && s.mnc === c.mnc && s.area === c.area));

    let points = 0;
    if (connectedMatch) points += 40;
    points += Math.min(matchingSigs.length, 4) * 10;
    if (exactCellMatch) points += 20;
    points += Math.min(neighbouringCellMatches, 2) * 5;
    if (sameTac && !exactCellMatch) points += 5;
    points -= Math.min(missing, 5) * 2;
    points = Math.max(0, Math.min(100, points));

    return {
      placeId,
      confidence: points / 100,
      connectedBssidMatch: connectedMatch,
      matchingWifiCount: matchingSigs.length,
      freshWifiCount: freshMatchingCount,
      missingExpectedWifi: missing,
      exactCellMatch,
      neighbouringCellMatches,
      sameTac,
      totalKnownWifi: placeWifiSigs.length,
    };
  });

  return scores.sort((a, b) => b.confidence - a.confidence);
}

function uncertaintyForEvidence({ freshWifiCount, exactCellMatch, candidateSource }) {
  if (candidateSource === 'cell_carrier') return 1500;
  if (candidateSource === 'cell_area' || candidateSource === 'cell_exact') {
    if (freshWifiCount === 0) return exactCellMatch ? 500 : 800;
  }
  if (freshWifiCount >= 8) return 25;
  if (freshWifiCount >= 5) return 32;
  if (freshWifiCount >= 3) return 45;
  if (freshWifiCount === 2) return 60;
  if (freshWifiCount === 1) return 120;
  return 500;
}

function decideResolveOutcome({ candidateSource, winner, runnerUp, snapshotAgeMs }) {
  if (!winner) {
    return { decision: candidateSource === 'none' ? 'unknown_fingerprint' : 'cell_viewport_hint', winner: null, uncertaintyM: uncertaintyForEvidence({ freshWifiCount: 0, candidateSource }) };
  }

  const runnerUpMargin = runnerUp ? winner.confidence - runnerUp.confidence : winner.confidence;
  const uncertaintyM = uncertaintyForEvidence({ freshWifiCount: winner.freshWifiCount, exactCellMatch: winner.exactCellMatch, candidateSource });

  let decision;
  if (runnerUp && runnerUpMargin < RUNNER_UP_MARGIN_MIN) {
    decision = 'ambiguous_match';
  } else if (snapshotAgeMs > 30000) {
    decision = 'display_only';
  } else if (winner.freshWifiCount === 1 && !winner.exactCellMatch) {
    decision = 'single_wifi_approximate';
  } else if (winner.freshWifiCount >= 8 && winner.confidence >= 0.7) {
    decision = 'route_eligible';
  } else if (winner.exactCellMatch && winner.freshWifiCount >= 2 && winner.confidence >= 0.82) {
    decision = 'route_eligible';
  } else if (winner.freshWifiCount >= 3 && winner.confidence >= 0.78) {
    decision = 'route_eligible';
  } else if (winner.confidence > 0) {
    decision = 'display_only';
  } else {
    decision = 'unknown_fingerprint';
  }

  return { decision, winner, runnerUpMargin, uncertaintyM };
}

async function logObservationRow({ body, requestKind, decision, confidence, matchedPlaceId, wifiCount, cellCount }) {
  try {
    return await RadioObservation.create({
      installationId: body.installation_id,
      capturedAt: new Date(body.captured_at),
      requestKind,
      matchedPlaceId,
      decision,
      confidence,
      collectorStatus: body.collector?.status ?? null,
      wifiCount,
      cellCount,
      matcherVersion: MATCHER_VERSION,
      requestId: body.observation_id,
    });
  } catch (err) {
    // Unique violation on request_id = the client retried an already-processed
    // request (network timeout, etc.) - idempotent no-op, not an error.
    if (err.name === 'SequelizeUniqueConstraintError') {
      return RadioObservation.findOne({ where: { requestId: body.observation_id } });
    }
    throw err;
  }
}

async function resolve(body) {
  const wifi = normalizeWifiList(body.wifi, Date.parse(body.captured_at));
  const cells = normalizeCellList(body.cells);
  const { source, placeIds } = await retrieveCandidatePlaceIds(wifi, cells);
  const scored = await scoreCandidates(placeIds, wifi, cells);
  const snapshotAgeMs = Date.now() - Date.parse(body.captured_at);
  const outcome = decideResolveOutcome({ candidateSource: source, winner: scored[0], runnerUp: scored[1], snapshotAgeMs });

  const place = outcome.winner ? await RadioPlace.findByPk(outcome.winner.placeId) : null;
  // A candidate place hasn't earned trust yet (see evaluatePromotion) no
  // matter how well this one request's signal happens to match it - a
  // brand-new place with a single confirming anchor can still score high on
  // wifi-match confidence alone. route_eligible must require both.
  if (outcome.decision === 'route_eligible' && place?.status !== 'trusted') {
    outcome.decision = 'display_only';
  }

  await logObservationRow({
    body,
    requestKind: 'resolve',
    decision: outcome.decision,
    confidence: outcome.winner?.confidence ?? null,
    matchedPlaceId: outcome.winner?.placeId ?? null,
    wifiCount: wifi.length,
    cellCount: cells.length,
  });

  if (!outcome.winner) {
    return { schema_version: 1, decision: outcome.decision, route_eligible: false, position: null, evidence: null };
  }

  return {
    schema_version: 1,
    decision: outcome.decision,
    route_eligible: outcome.decision === 'route_eligible',
    single_wifi_trusted: false,
    confidence: outcome.winner.confidence,
    place_id: place.id,
    place_version: place.version,
    position: { latitude: place.latitude, longitude: place.longitude, altitude_m: place.altitudeM, horizontal_uncertainty_m: outcome.uncertaintyM },
    evidence: {
      wifi_matches: outcome.winner.matchingWifiCount,
      fresh_wifi_matches: outcome.winner.freshWifiCount,
      connected_bssid_match: outcome.winner.connectedBssidMatch,
      known_registered_cell: outcome.winner.exactCellMatch,
      known_neighbouring_cells: outcome.winner.neighbouringCellMatches,
      same_tac: outcome.winner.sameTac,
      missing_expected_wifi: outcome.winner.missingExpectedWifi,
      runner_up_margin: outcome.runnerUpMargin ?? null,
      place_confirmation_count: place.confirmationCount,
      distinct_confirming_devices: place.distinctDeviceCount,
    },
    matcher: { model_version: MATCHER_VERSION },
  };
}

function evaluateAnchor(anchor) {
  if (!anchor) return { present: false, accepted: false, reason: null };
  if (DISALLOWED_ANCHOR_SOURCES.has(anchor.source)) return { present: true, accepted: false, reason: 'disallowed_source' };
  if (anchor.is_mocked) return { present: true, accepted: false, reason: 'mocked' };
  const ageMs = Date.now() - Date.parse(anchor.captured_at);
  if (ageMs > MAX_ANCHOR_AGE_MS || ageMs < -5000) return { present: true, accepted: false, reason: 'stale' };
  if (anchor.horizontal_accuracy_m > ANCHOR_MAX_ACCURACY_M) return { present: true, accepted: false, reason: 'inaccurate' };
  return { present: true, accepted: true, reason: null };
}

async function findNearbyPlace(latitude, longitude, radiusM = 60) {
  // No PostGIS installed - a cheap lat/lng bounding-box prefilter (good enough
  // at this scale/latitude) followed by an exact haversine check in JS.
  const deg = radiusM / 111320;
  const candidates = await RadioPlace.findAll({
    where: {
      latitude: { [Op.between]: [latitude - deg, latitude + deg] },
      longitude: { [Op.between]: [longitude - deg, longitude + deg] },
      status: { [Op.ne]: 'retired' },
    },
  });
  let best = null;
  let bestDist = Infinity;
  for (const place of candidates) {
    const dist = haversineMeters(latitude, longitude, place.latitude, place.longitude);
    if (dist <= radiusM && dist < bestDist) {
      best = place;
      bestDist = dist;
    }
  }
  return best ? { place: best, distanceM: bestDist } : null;
}

async function upsertWifiSignature(placeId, w) {
  const [row, created] = await WifiSignature.findOrCreate({
    where: { placeId, bssidToken: w.bssidToken },
    defaults: {
      tokenKeyVersion: w.tokenKeyVersion,
      meanRssi: w.rssiDbm,
      rssiM2: 0,
      rssiSampleCount: 1,
      connectedObservationCount: w.connected ? 1 : 0,
      frequencyMhz: w.frequencyMhz,
      channelWidth: w.channelWidth,
      lastSeenAt: new Date(),
    },
  });
  if (!created) {
    const { mean, m2, count } = welfordUpdate(row.meanRssi, row.rssiM2, row.rssiSampleCount, w.rssiDbm);
    await row.update({
      meanRssi: mean,
      rssiM2: m2,
      rssiSampleCount: count,
      connectedObservationCount: row.connectedObservationCount + (w.connected ? 1 : 0),
      frequencyMhz: w.frequencyMhz ?? row.frequencyMhz,
      channelWidth: w.channelWidth ?? row.channelWidth,
      lastSeenAt: new Date(),
    });
  }
}

async function upsertCellSignature(placeId, c) {
  const [row, created] = await CellSignature.findOrCreate({
    where: { placeId, radio: c.radio, mcc: c.mcc, mnc: c.mnc, area: c.area, cellId: c.cellId },
    defaults: {
      pci: c.pci,
      channel: c.channel,
      registeredObservationCount: c.registered ? 1 : 0,
      meanSignalDbm: c.signalDbm ?? 0,
      signalM2: 0,
      sampleCount: c.signalDbm != null ? 1 : 0,
      lastSeenAt: new Date(),
    },
  });
  if (!created) {
    const updates = { registeredObservationCount: row.registeredObservationCount + (c.registered ? 1 : 0), lastSeenAt: new Date() };
    if (c.signalDbm != null) {
      const { mean, m2, count } = welfordUpdate(row.meanSignalDbm, row.signalM2, row.sampleCount, c.signalDbm);
      Object.assign(updates, { meanSignalDbm: mean, signalM2: m2, sampleCount: count });
    }
    await row.update(updates);
  }
}

// A device sitting in one spot hammering the app for a few minutes must not
// be able to rack up confirmations by itself and fake full trust - each
// burst of activity from the same installation only counts as one session
// unless at least this much time has passed since its last counted anchor.
//
// 2 sessions / 5 min is loosened for the field-test phase (2026-08-21,
// deliberate call, not an oversight) - tighten this back up (5+ sessions,
// 20+ min gap) before this is allowed to influence real users, since a
// single device idling for 5 minutes is a much weaker proof of a stable,
// real location than genuinely separate visits.
const SESSION_GAP_MS = 5 * 60 * 1000;
const SAME_DEVICE_SESSIONS_REQUIRED = 2;

async function evaluatePromotion(place) {
  if (place.status !== 'candidate') return;
  const wifiSigCount = await WifiSignature.count({ where: { placeId: place.id } });
  // Count only observations backed by an *accepted* anchor - a resolve-only
  // or rejected-anchor hit on this place must not count toward promotion.
  const confirmingObservations = await RadioObservation.findAll({
    where: { matchedPlaceId: place.id, requestKind: 'observation' },
    include: [{ model: AnchorEvidence, as: 'anchorEvidence', required: true, where: { accepted: true }, attributes: ['createdAt'] }],
    attributes: ['installationId'],
  });
  const acceptedAnchors = confirmingObservations.length;
  const distinctInstallations = new Set(confirmingObservations.map((o) => o.installationId)).size;

  const sortedByInstallation = new Map();
  for (const obs of confirmingObservations) {
    const list = sortedByInstallation.get(obs.installationId) ?? [];
    list.push(obs.anchorEvidence.createdAt.getTime());
    sortedByInstallation.set(obs.installationId, list);
  }
  let maxSessionsForOneInstallation = 0;
  for (const timestamps of sortedByInstallation.values()) {
    timestamps.sort((a, b) => a - b);
    let sessions = 1;
    for (let i = 1; i < timestamps.length; i += 1) {
      if (timestamps[i] - timestamps[i - 1] >= SESSION_GAP_MS) sessions += 1;
    }
    maxSessionsForOneInstallation = Math.max(maxSessionsForOneInstallation, sessions);
  }

  const isMultiRouter = wifiSigCount >= 2;
  const promote = isMultiRouter
    ? (acceptedAnchors >= 3 && distinctInstallations >= 2) || maxSessionsForOneInstallation >= SAME_DEVICE_SESSIONS_REQUIRED
    : acceptedAnchors >= 5 && distinctInstallations >= 2;

  if (promote) await place.update({ status: 'trusted' });
}

async function touchDeviceTrust(installationId, { accepted }) {
  const [row] = await DeviceTrust.findOrCreate({ where: { installationId }, defaults: { lastSeenAt: new Date() } });
  await row.update({
    acceptedAnchorCount: row.acceptedAnchorCount + (accepted ? 1 : 0),
    rejectedAnchorCount: row.rejectedAnchorCount + (accepted ? 0 : 1),
    lastSeenAt: new Date(),
  });
}

async function observe(body) {
  const wifi = normalizeWifiList(body.wifi, Date.parse(body.captured_at));
  const cells = normalizeCellList(body.cells);
  const anchorEval = evaluateAnchor(body.anchor);

  const { source, placeIds } = await retrieveCandidatePlaceIds(wifi, cells);
  const scored = await scoreCandidates(placeIds, wifi, cells);
  const snapshotAgeMs = Date.now() - Date.parse(body.captured_at);
  const outcome = decideResolveOutcome({ candidateSource: source, winner: scored[0], runnerUp: scored[1], snapshotAgeMs });

  let targetPlace = outcome.winner ? await RadioPlace.findByPk(outcome.winner.placeId) : null;
  let distanceFromPlaceM = null;

  if (anchorEval.accepted) {
    if (targetPlace) {
      distanceFromPlaceM = haversineMeters(body.anchor.latitude, body.anchor.longitude, targetPlace.latitude, targetPlace.longitude);
    } else {
      const nearby = await findNearbyPlace(body.anchor.latitude, body.anchor.longitude);
      if (nearby) {
        targetPlace = nearby.place;
        distanceFromPlaceM = nearby.distanceM;
      } else if (wifi.length || cells.length) {
        targetPlace = await RadioPlace.create({
          latitude: body.anchor.latitude,
          longitude: body.anchor.longitude,
          altitudeM: body.anchor.altitude_m ?? null,
          horizontalUncertaintyM: Math.max(body.anchor.horizontal_accuracy_m, 30),
          confirmationCount: 0,
          distinctDeviceCount: 0,
          status: 'candidate',
        });
        distanceFromPlaceM = 0;
      }
    }
  }

  const observationRow = await logObservationRow({
    body,
    requestKind: 'observation',
    decision: outcome.decision,
    confidence: outcome.winner?.confidence ?? null,
    matchedPlaceId: targetPlace?.id ?? outcome.winner?.placeId ?? null,
    wifiCount: wifi.length,
    cellCount: cells.length,
  });

  if (anchorEval.present) {
    await AnchorEvidence.create({
      observationId: observationRow.id,
      latitude: body.anchor.latitude,
      longitude: body.anchor.longitude,
      altitudeM: body.anchor.altitude_m ?? null,
      accuracyM: body.anchor.horizontal_accuracy_m,
      source: body.anchor.source,
      isMocked: body.anchor.is_mocked,
      accepted: anchorEval.accepted,
      rejectionReason: anchorEval.reason,
      distanceFromPlaceM,
    });
    await touchDeviceTrust(body.installation_id, { accepted: anchorEval.accepted });
  }

  let learned = false;
  if (anchorEval.accepted && targetPlace) {
    await Promise.all([...wifi.map((w) => upsertWifiSignature(targetPlace.id, w)), ...cells.map((c) => upsertCellSignature(targetPlace.id, c))]);

    const alreadyConfirmedByDevice = await RadioObservation.count({
      where: { matchedPlaceId: targetPlace.id, installationId: body.installation_id, requestKind: 'observation' },
    });
    await targetPlace.update({
      confirmationCount: targetPlace.confirmationCount + 1,
      distinctDeviceCount: alreadyConfirmedByDevice <= 1 ? targetPlace.distinctDeviceCount + 1 : targetPlace.distinctDeviceCount,
      lastSeenAt: new Date(),
    });
    await evaluatePromotion(targetPlace);
    learned = true;
  }

  return {
    schema_version: 1,
    observation_id: body.observation_id,
    accepted_as_learning: learned,
    anchor_rejection_reason: anchorEval.present && !anchorEval.accepted ? anchorEval.reason : null,
    decision: outcome.decision,
    place_id: targetPlace?.id ?? null,
  };
}

// --- PDR trajectory ingestion ------------------------------------------
//
// See mobile dev's "PakMaps indoor PDR backend integration" doc (2026-08-25).
// A trajectory point is weak, inferred evidence (step-counter + compass), not
// proof - it must never reach RadioPlace/WifiSignature/CellSignature or
// affect evaluatePromotion/resolve. That isolation is structural here: this
// function only ever writes to RadioInferredTrajectory, and doesn't call any
// of the upsert*/evaluatePromotion helpers above. Unlike observe()'s anchor
// handling (which soft-records a rejected anchor as data), every check below
// is a hard 4xx per the doc's contract - nothing is persisted on rejection.
const MAX_TRAJECTORY_ANCHOR_AGE_MS = 60 * 1000;
const TRAJECTORY_ANCHOR_MATCH_WINDOW_MS = 10 * 1000;
const MAX_TRAJECTORY_SNAPSHOT_AGE_MS = 2 * 60 * 1000;
const TRAJECTORY_FUTURE_SKEW_TOLERANCE_MS = 5 * 1000;
const TRAJECTORY_FRESH_WIFI_MAX_AGE_MS = 30 * 1000;

async function findMatchingAnchorObservation(installationId, anchorCapturedAtMs) {
  return RadioObservation.findOne({
    where: {
      installationId,
      requestKind: 'observation',
      capturedAt: {
        [Op.between]: [new Date(anchorCapturedAtMs - TRAJECTORY_ANCHOR_MATCH_WINDOW_MS), new Date(anchorCapturedAtMs + TRAJECTORY_ANCHOR_MATCH_WINDOW_MS)],
      },
    },
    // required: true on the include - only a genuinely GNSS-backed,
    // accepted anchor counts. A resolve-only hit or a rejected anchor
    // (mocked, stale, disallowed source) must not be usable as the
    // authoritative anchor for a trajectory point.
    include: [{ model: AnchorEvidence, as: 'anchorEvidence', required: true, where: { accepted: true } }],
    order: [['capturedAt', 'DESC']],
  });
}

async function recordTrajectory(body) {
  const nowMs = Date.now();

  const capturedAtMs = Date.parse(body.captured_at);
  if (nowMs - capturedAtMs > MAX_TRAJECTORY_SNAPSHOT_AGE_MS || capturedAtMs - nowMs > TRAJECTORY_FUTURE_SKEW_TOLERANCE_MS) {
    throw new AppError('Trajectory report capture time is stale or in the future.', 400);
  }

  const anchorCapturedAtMs = Date.parse(body.anchor.captured_at);
  const anchorAgeMs = nowMs - anchorCapturedAtMs;
  if (anchorAgeMs > MAX_TRAJECTORY_ANCHOR_AGE_MS || anchorAgeMs < -TRAJECTORY_FUTURE_SKEW_TOLERANCE_MS) {
    throw new AppError('Trajectory anchor is stale or in the future.', 400);
  }

  const wifi = normalizeWifiList(body.wifi, capturedAtMs);
  const cells = normalizeCellList(body.cells);
  const hasUsableWifi = wifi.some((w) => w.connected || w.ageMs <= TRAJECTORY_FRESH_WIFI_MAX_AGE_MS);
  if (!hasUsableWifi) {
    throw new AppError('At least one connected or recently seen Wi-Fi network is required.', 400);
  }

  const anchorObservation = await findMatchingAnchorObservation(body.installation_id, anchorCapturedAtMs);
  if (!anchorObservation) {
    throw new AppError('No matching GNSS-backed observation found for this anchor.', 400);
  }

  try {
    await RadioInferredTrajectory.create({
      requestId: body.observation_id,
      installationId: body.installation_id,
      capturedAt: new Date(body.captured_at),
      anchorObservationId: anchorObservation.id,
      anchorCapturedAt: new Date(body.anchor.captured_at),
      anchorAccuracyM: body.anchor.horizontal_accuracy_m,
      anchorAgeMs: body.anchor.age_ms,
      anchorSource: body.anchor.source,
      latitude: body.inferred_position.latitude,
      longitude: body.inferred_position.longitude,
      horizontalUncertaintyM: body.inferred_position.horizontal_uncertainty_m,
      distanceSinceAnchorM: body.motion.distance_since_anchor_m,
      stepsSinceAnchor: body.motion.steps_since_anchor,
      headingDeg: body.motion.heading_deg,
      headingAccuracyDeg: body.motion.heading_accuracy_deg,
      wifiEvidence: wifi.map((w) => ({ bssid_token: w.bssidToken, rssi_dbm: w.rssiDbm, connected: w.connected, age_ms: w.ageMs })),
      cellEvidence: cells.map((c) => ({ radio: c.radio, mcc: c.mcc, mnc: c.mnc, area: c.area, cell_id: c.cellId, age_ms: c.ageMs })),
      wifiCount: wifi.length,
      cellCount: cells.length,
    });
  } catch (err) {
    // Duplicate observation_id = client retry of an already-accepted point -
    // idempotent no-op, same pattern as logObservationRow above.
    if (err.name !== 'SequelizeUniqueConstraintError') throw err;
  }

  return { schema_version: 1, observation_id: body.observation_id, accepted: true };
}

module.exports = {
  resolve,
  observe,
  recordTrajectory,
  normalizeWifiList,
  normalizeCellList,
  evaluateAnchor,
  decideResolveOutcome,
  uncertaintyForEvidence,
  welfordUpdate,
  haversineMeters,
  sequelize,
};
