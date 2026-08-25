const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeBssid, isLocallyAdministered, isBroadcastOrMulticast, tokenizeBssid } = require('../src/utils/bssid');
const { normalizeWifiList, normalizeCellList, evaluateAnchor, decideResolveOutcome, uncertaintyForEvidence, welfordUpdate, haversineMeters } = require('../src/modules/positioning/positioning.service');
const { trajectoryBodySchema } = require('../src/modules/positioning/positioning.validation');

// --- bssid.js -------------------------------------------------------------

test('normalizeBssid accepts well-formed MACs and lowercases them', () => {
  assert.equal(normalizeBssid('AA:BB:CC:11:22:33'), 'aa:bb:cc:11:22:33');
  assert.equal(normalizeBssid('  aa:bb:cc:11:22:33  '), 'aa:bb:cc:11:22:33');
});

test('normalizeBssid rejects malformed input', () => {
  assert.equal(normalizeBssid('not-a-mac'), null);
  assert.equal(normalizeBssid('aa:bb:cc:11:22'), null);
  assert.equal(normalizeBssid(''), null);
  assert.equal(normalizeBssid(null), null);
  assert.equal(normalizeBssid(12345), null);
});

test('isLocallyAdministered flags randomized/self-assigned MACs, not real hardware addresses', () => {
  // Bit 1 of the first octet set = locally administered. 0x02 = 00000010.
  assert.equal(isLocallyAdministered('02:00:00:00:00:00'), true);
  assert.equal(isLocallyAdministered('06:11:22:33:44:55'), true);
  // A real vendor-assigned OUI (e.g. Cisco: 00:1a:...) has that bit clear.
  assert.equal(isLocallyAdministered('00:1a:2b:33:44:55'), false);
});

test('isBroadcastOrMulticast flags ff:ff:ff:ff:ff:ff and multicast addresses', () => {
  assert.equal(isBroadcastOrMulticast('ff:ff:ff:ff:ff:ff'), true);
  assert.equal(isBroadcastOrMulticast('01:00:5e:00:00:01'), true);
  assert.equal(isBroadcastOrMulticast('00:1a:2b:33:44:55'), false);
});

test('tokenizeBssid never leaks the raw address and is deterministic', () => {
  const { token: t1 } = tokenizeBssid('00:1a:2b:33:44:55');
  const { token: t2 } = tokenizeBssid('00:1a:2b:33:44:55');
  const { token: t3 } = tokenizeBssid('00:1a:2b:33:44:56');
  assert.equal(t1, t2);
  assert.notEqual(t1, t3);
  assert.equal(t1.includes('00:1a:2b'), false);
  assert.match(t1, /^[0-9a-f]{64}$/);
});

// --- normalization / filtering --------------------------------------------

test('normalizeWifiList drops stale, randomized, and broadcast entries', () => {
  const result = normalizeWifiList([
    { bssid: '00:1a:2b:33:44:55', rssiDbm: -50, connected: true, ageMs: 0 },
    { bssid: '00:1a:2b:33:44:56', rssiDbm: -60, connected: false, ageMs: 3 * 60 * 1000 }, // stale (>2min)
    { bssid: '02:11:22:33:44:55', rssiDbm: -40, connected: false, ageMs: 0 }, // randomized
    { bssid: 'ff:ff:ff:ff:ff:ff', rssiDbm: -30, connected: false, ageMs: 0 }, // broadcast
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].normalizedBssid, '00:1a:2b:33:44:55');
});

test('normalizeWifiList dedupes the same BSSID, keeping the freshest reading', () => {
  const result = normalizeWifiList([
    { bssid: '00:1a:2b:33:44:55', rssiDbm: -70, connected: false, ageMs: 5000 },
    { bssid: '00:1a:2b:33:44:55', rssiDbm: -50, connected: false, ageMs: 100 },
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].ageMs, 100);
});

test('normalizeWifiList sorts the connected network first', () => {
  const result = normalizeWifiList([
    { bssid: '00:1a:2b:33:44:55', rssiDbm: -40, connected: false, ageMs: 0 },
    { bssid: '00:1a:2b:33:44:56', rssiDbm: -80, connected: true, ageMs: 0 },
  ]);
  assert.equal(result[0].normalizedBssid, '00:1a:2b:33:44:56');
});

test('normalizeWifiList caps the list at 50 entries', () => {
  const many = Array.from({ length: 80 }, (_, i) => ({
    bssid: `00:1a:2b:00:${String(Math.floor(i / 256)).padStart(2, '0')}:${String(i % 256).padStart(2, '0')}`,
    rssiDbm: -50,
    connected: false,
    ageMs: 0,
  }));
  assert.equal(normalizeWifiList(many).length, 50);
});

test('normalizeCellList drops entries missing area/cell id or too stale', () => {
  const result = normalizeCellList([
    { radio: 'lte', mcc: '410', mnc: '01', area: 100, cellId: 200, ageMs: 0 },
    { radio: 'lte', mcc: '410', mnc: '01', area: null, cellId: null, ageMs: 0 },
    { radio: 'lte', mcc: '410', mnc: '01', area: 100, cellId: 200, ageMs: 3 * 60 * 1000 },
  ]);
  assert.equal(result.length, 1);
});

// --- anchor eligibility (the core anti-poisoning rule) --------------------

function freshAnchor(overrides = {}) {
  return {
    latitude: 33.6,
    longitude: 73.2,
    horizontal_accuracy_m: 6,
    captured_at: new Date().toISOString(),
    source: 'platform_stream',
    is_mocked: false,
    ...overrides,
  };
}

test('evaluateAnchor accepts a fresh, accurate, non-mocked platform fix', () => {
  const result = evaluateAnchor(freshAnchor());
  assert.equal(result.accepted, true);
});

test('evaluateAnchor rejects a position derived from our own radio matching (no self-teaching loop)', () => {
  for (const source of ['local_radio', 'backend_radio', 'beacondb', 'opencellid', 'cell_viewport_hint', 'cached_position', 'approximate_position']) {
    const result = evaluateAnchor(freshAnchor({ source }));
    assert.equal(result.accepted, false, `source=${source} should be rejected`);
    assert.equal(result.reason, 'disallowed_source');
  }
});

test('evaluateAnchor rejects mocked locations', () => {
  const result = evaluateAnchor(freshAnchor({ is_mocked: true }));
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'mocked');
});

test('evaluateAnchor rejects a stale fix (older than 10s)', () => {
  const result = evaluateAnchor(freshAnchor({ captured_at: new Date(Date.now() - 15000).toISOString() }));
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'stale');
});

test('evaluateAnchor rejects an inaccurate fix (worse than 25m)', () => {
  const result = evaluateAnchor(freshAnchor({ horizontal_accuracy_m: 40 }));
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'inaccurate');
});

test('evaluateAnchor reports absent when no anchor was sent at all', () => {
  const result = evaluateAnchor(undefined);
  assert.equal(result.present, false);
  assert.equal(result.accepted, false);
});

// --- resolve decision logic -------------------------------------------------

test('decideResolveOutcome returns unknown_fingerprint when nothing matched at all', () => {
  const result = decideResolveOutcome({ candidateSource: 'none', winner: null, runnerUp: null, snapshotAgeMs: 0 });
  assert.equal(result.decision, 'unknown_fingerprint');
});

test('decideResolveOutcome returns cell_viewport_hint for a cell-only broad match', () => {
  const result = decideResolveOutcome({ candidateSource: 'cell_carrier', winner: null, runnerUp: null, snapshotAgeMs: 0 });
  assert.equal(result.decision, 'cell_viewport_hint');
});

test('decideResolveOutcome flags a close race between two places as ambiguous, not a confident pick', () => {
  const winner = { placeId: 'a', confidence: 0.5, freshWifiCount: 5, exactCellMatch: false };
  const runnerUp = { placeId: 'b', confidence: 0.4, freshWifiCount: 4, exactCellMatch: false };
  const result = decideResolveOutcome({ candidateSource: 'wifi', winner, runnerUp, snapshotAgeMs: 0 });
  assert.equal(result.decision, 'ambiguous_match');
});

test('decideResolveOutcome grants route_eligible only for a rich, confident fingerprint', () => {
  const winner = { placeId: 'a', confidence: 0.85, freshWifiCount: 9, exactCellMatch: false };
  const result = decideResolveOutcome({ candidateSource: 'wifi', winner, runnerUp: null, snapshotAgeMs: 0 });
  assert.equal(result.decision, 'route_eligible');
});

test('decideResolveOutcome downgrades a rich match to display_only once the snapshot is stale', () => {
  const winner = { placeId: 'a', confidence: 0.85, freshWifiCount: 9, exactCellMatch: false };
  const result = decideResolveOutcome({ candidateSource: 'wifi', winner, runnerUp: null, snapshotAgeMs: 45000 });
  assert.equal(result.decision, 'display_only');
});

test('decideResolveOutcome treats a single matching router as approximate, not route-eligible', () => {
  const winner = { placeId: 'a', confidence: 0.4, freshWifiCount: 1, exactCellMatch: false };
  const result = decideResolveOutcome({ candidateSource: 'wifi', winner, runnerUp: null, snapshotAgeMs: 0 });
  assert.equal(result.decision, 'single_wifi_approximate');
});

test('uncertaintyForEvidence shrinks as fresh Wi-Fi evidence grows', () => {
  const one = uncertaintyForEvidence({ freshWifiCount: 1, candidateSource: 'wifi' });
  const three = uncertaintyForEvidence({ freshWifiCount: 3, candidateSource: 'wifi' });
  const eight = uncertaintyForEvidence({ freshWifiCount: 8, candidateSource: 'wifi' });
  assert.ok(one > three && three > eight, `expected ${one} > ${three} > ${eight}`);
});

// --- shared math helpers ----------------------------------------------------

test('welfordUpdate tracks a running mean matching a plain average', () => {
  const values = [-50, -52, -48, -55];
  let state = { mean: values[0], m2: 0, count: 1 };
  for (const v of values.slice(1)) state = welfordUpdate(state.mean, state.m2, state.count, v);
  const expectedMean = values.reduce((a, b) => a + b, 0) / values.length;
  assert.ok(Math.abs(state.mean - expectedMean) < 1e-9);
  assert.equal(state.count, values.length);
});

test('haversineMeters returns ~0 for the same point and a sane distance for two known points', () => {
  assert.ok(haversineMeters(33.6, 73.2, 33.6, 73.2) < 0.01);
  // Islamabad (33.6844, 73.0479) to Lahore (31.5497, 74.3436) is ~275km.
  const distance = haversineMeters(33.6844, 73.0479, 31.5497, 74.3436);
  assert.ok(distance > 260000 && distance < 290000, `got ${distance}`);
});

// --- PDR trajectory request contract ---------------------------------------
// The DB-dependent half of recordTrajectory (matching the real GNSS anchor,
// idempotent insert) isn't covered here, same as the rest of this file -
// verified live against the real DB instead. These cover the hard-reject
// boundary rules from the request contract, since those are pure zod checks.

function validTrajectoryBody(overrides = {}) {
  const now = Date.now();
  return {
    schema_version: 1,
    observation_id: '11111111-1111-1111-1111-111111111111',
    installation_id: 'install-abc',
    captured_at: new Date(now).toISOString(),
    platform: 'android',
    wifi: [{ bssid: '00:1a:2b:33:44:55', rssi_dbm: -50, connected: true, age_ms: 0 }],
    cells: [],
    inferred_position: {
      latitude: 33.684531,
      longitude: 73.047774,
      horizontal_uncertainty_m: 11.4,
      captured_at: new Date(now).toISOString(),
      source: 'pdr_inferred',
    },
    anchor: {
      captured_at: new Date(now - 30000).toISOString(),
      horizontal_accuracy_m: 8.0,
      age_ms: 30000,
      source: 'platform_stream',
    },
    motion: {
      distance_since_anchor_m: 15.0,
      steps_since_anchor: 20,
      heading_deg: 90.0,
      heading_accuracy_deg: 15.0,
    },
    ...overrides,
  };
}

function parseTrajectory(overrides = {}) {
  return trajectoryBodySchema.safeParse({ body: validTrajectoryBody(overrides) });
}

test('trajectoryBodySchema accepts a well-formed request', () => {
  assert.equal(parseTrajectory().success, true);
});

test('trajectoryBodySchema rejects an inferred_position.source other than pdr_inferred', () => {
  const result = parseTrajectory({ inferred_position: { ...validTrajectoryBody().inferred_position, source: 'gps' } });
  assert.equal(result.success, false);
});

test('trajectoryBodySchema rejects uncertainty outside (0, 30]', () => {
  assert.equal(parseTrajectory({ inferred_position: { ...validTrajectoryBody().inferred_position, horizontal_uncertainty_m: 0 } }).success, false);
  assert.equal(parseTrajectory({ inferred_position: { ...validTrajectoryBody().inferred_position, horizontal_uncertainty_m: 31 } }).success, false);
});

test('trajectoryBodySchema rejects anchor age over 60,000ms or non-positive accuracy', () => {
  assert.equal(parseTrajectory({ anchor: { ...validTrajectoryBody().anchor, age_ms: 60001 } }).success, false);
  assert.equal(parseTrajectory({ anchor: { ...validTrajectoryBody().anchor, horizontal_accuracy_m: 0 } }).success, false);
  assert.equal(parseTrajectory({ anchor: { ...validTrajectoryBody().anchor, horizontal_accuracy_m: 26 } }).success, false);
});

test('trajectoryBodySchema rejects distance since anchor outside (0, 30]m', () => {
  assert.equal(parseTrajectory({ motion: { ...validTrajectoryBody().motion, distance_since_anchor_m: 0 } }).success, false);
  assert.equal(parseTrajectory({ motion: { ...validTrajectoryBody().motion, distance_since_anchor_m: 30.1 } }).success, false);
});

test('trajectoryBodySchema rejects non-positive step counts', () => {
  assert.equal(parseTrajectory({ motion: { ...validTrajectoryBody().motion, steps_since_anchor: 0 } }).success, false);
});

test('trajectoryBodySchema rejects heading outside [0, 360) or heading accuracy over 25deg', () => {
  assert.equal(parseTrajectory({ motion: { ...validTrajectoryBody().motion, heading_deg: 360 } }).success, false);
  assert.equal(parseTrajectory({ motion: { ...validTrajectoryBody().motion, heading_deg: -1 } }).success, false);
  assert.equal(parseTrajectory({ motion: { ...validTrajectoryBody().motion, heading_accuracy_deg: 26 } }).success, false);
});
