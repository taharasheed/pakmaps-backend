// Public contract for POST /navigation/map-match: request validation,
// translation to a Valhalla trace_attributes call, and translation of
// Valhalla's response back into our stable public shape. Adapted from the
// reference implementation in mapifyit_routes/map_match_handoff/ - same
// validation bounds and response shape, ported into this codebase's
// conventions (CommonJS, our own error type) rather than copied verbatim.

const MAX_SAMPLES = 20;
const MIN_SAMPLES = 2;
const MAX_ID_LENGTH = 128;

class ContractError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ContractError';
  }
}

function finiteNumber(value, name, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ContractError(`${name} must be a finite number`);
  }
  if (value < min || value > max) {
    throw new ContractError(`${name} is outside its allowed range`);
  }
  return value;
}

// iOS reports CLLocationDirection as -1 when heading is unavailable (device
// stationary or course not yet resolved) - a legitimate, common value at the
// start of a trip, not malformed input. Treated as "unknown" (null) rather
// than rejecting the whole batch.
function headingOrUnknown(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ContractError(`${name} must be a finite number`);
  }
  if (value === -1) return null;
  if (value < 0 || value > 359.999999) {
    throw new ContractError(`${name} is outside its allowed range`);
  }
  return value;
}

function hasControlCharacter(value) {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function opaqueId(value, name) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > MAX_ID_LENGTH ||
    hasControlCharacter(value)
  ) {
    throw new ContractError(`${name} is invalid`);
  }
  return value;
}

function validateMapMatchRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ContractError('body must be an object');
  }

  const requestId = opaqueId(input.requestId, 'requestId');
  const sessionGeneration = opaqueId(input.sessionGeneration, 'sessionGeneration');
  const routeId = opaqueId(input.routeId, 'routeId');
  const sequenceId = finiteNumber(input.sequenceId, 'sequenceId', 0, Number.MAX_SAFE_INTEGER);

  if (!Number.isSafeInteger(sequenceId)) {
    throw new ContractError('sequenceId must be a safe integer');
  }
  if (input.costing !== 'auto') {
    throw new ContractError('costing is not allowed');
  }

  const gpsAccuracyMeters = finiteNumber(input.gpsAccuracyMeters, 'gpsAccuracyMeters', 1, 100);
  const searchRadiusMeters = finiteNumber(input.searchRadiusMeters, 'searchRadiusMeters', 5, 100);

  if (
    !Array.isArray(input.samples) ||
    input.samples.length < MIN_SAMPLES ||
    input.samples.length > MAX_SAMPLES
  ) {
    throw new ContractError(`samples must contain ${MIN_SAMPLES} to ${MAX_SAMPLES} items`);
  }

  const seenSampleIds = new Set();
  let previousTimestamp = -Infinity;
  const samples = input.samples.map((sample, index) => {
    if (!sample || typeof sample !== 'object' || Array.isArray(sample)) {
      throw new ContractError(`samples[${index}] must be an object`);
    }

    const timestamp = finiteNumber(sample.timestamp, `samples[${index}].timestamp`, 0, Number.MAX_SAFE_INTEGER);
    if (!Number.isSafeInteger(timestamp) || timestamp <= previousTimestamp) {
      throw new ContractError('sample timestamps must be strictly increasing');
    }
    previousTimestamp = timestamp;

    const id = opaqueId(sample.id, `samples[${index}].id`);
    if (seenSampleIds.has(id)) {
      throw new ContractError('duplicate sample id');
    }
    seenSampleIds.add(id);

    return {
      id,
      latitude: finiteNumber(sample.latitude, `samples[${index}].latitude`, -90, 90),
      longitude: finiteNumber(sample.longitude, `samples[${index}].longitude`, -180, 180),
      timestamp,
      accuracyMeters: finiteNumber(sample.accuracyMeters, `samples[${index}].accuracyMeters`, 1, 100),
      speedMps: finiteNumber(sample.speedMps, `samples[${index}].speedMps`, 0, 100),
      headingDegrees: headingOrUnknown(sample.headingDegrees, `samples[${index}].headingDegrees`),
      headingAccuracyDegrees: finiteNumber(
        sample.headingAccuracyDegrees,
        `samples[${index}].headingAccuracyDegrees`,
        0,
        180
      ),
    };
  });

  return {
    requestId,
    sessionGeneration,
    routeId,
    sequenceId,
    costing: 'auto',
    gpsAccuracyMeters,
    searchRadiusMeters,
    samples,
  };
}

function buildValhallaRequest(request) {
  return {
    costing: request.costing,
    shape_match: 'map_snap',
    shape: request.samples.map((sample) => ({
      lat: sample.latitude,
      lon: sample.longitude,
      time: sample.timestamp,
      accuracy: sample.accuracyMeters,
    })),
    trace_options: {
      search_radius: request.searchRadiusMeters,
      gps_accuracy: request.gpsAccuracyMeters,
    },
    filters: {
      action: 'include',
      attributes: [
        'shape',
        'matched.point',
        'matched.type',
        'matched.edge_index',
        'matched.distance_along_edge',
        'matched.distance_from_trace_point',
        'edge.names',
        'edge.id',
        'edge.way_id',
        'edge.begin_heading',
        'edge.end_heading',
        'edge.forward',
        'edge.roundabout',
        'edge.use',
      ],
    },
  };
}

function optionalFinite(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeNames(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean).slice(0, 8);
}

// Interpolates the road's bearing at a point partway along an edge, using
// the edge's begin/end heading - needed because Valhalla's matched_points
// give a discrete lat/lon per GPS sample but not a heading, so without this
// the client has to estimate heading from point-to-point vectors, which is
// accurate on straight segments but visibly wrong through a curve (the
// puck's rotation lags/cuts the corner instead of tracking the curve).
function interpolatedHeading(beginHeading, endHeading, fraction) {
  if (beginHeading === null || endHeading === null || fraction === null) return beginHeading;
  let delta = endHeading - beginHeading;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  const heading = beginHeading + delta * Math.max(0, Math.min(1, fraction));
  return ((heading % 360) + 360) % 360;
}

function translateValhallaResponse(request, upstream) {
  if (!upstream || typeof upstream !== 'object' || Array.isArray(upstream)) {
    throw new ContractError('upstream response is invalid');
  }

  const rawMatched = Array.isArray(upstream.matched_points) ? upstream.matched_points : [];
  const rawEdges = Array.isArray(upstream.edges) ? upstream.edges : [];

  const edges = rawEdges.slice(0, 64).map((raw, edgeIndex) => {
    const edge = raw && typeof raw === 'object' ? raw : {};
    const suppliedIndex = optionalFinite(edge.edge_index);
    return {
      edgeIndex: suppliedIndex !== null && Number.isInteger(suppliedIndex) ? suppliedIndex : edgeIndex,
      edgeId: typeof edge.id === 'string' || typeof edge.id === 'number' ? String(edge.id) : null,
      names: normalizeNames(edge.names),
      beginHeading: optionalFinite(edge.begin_heading),
      endHeading: optionalFinite(edge.end_heading),
      forward: typeof edge.forward === 'boolean' ? edge.forward : null,
      wayId: typeof edge.way_id === 'string' || typeof edge.way_id === 'number' ? String(edge.way_id) : null,
      isRoundabout: edge.roundabout === true || edge.use === 'roundabout',
    };
  });

  const matchedPoints = request.samples.map((sample, index) => {
    const raw = rawMatched[index];
    const rawPoint = raw && typeof raw === 'object' ? raw : {};
    const latitude = optionalFinite(rawPoint.lat);
    const longitude = optionalFinite(rawPoint.lon);
    const edgeIndex = optionalFinite(rawPoint.edge_index);
    const distance = optionalFinite(rawPoint.distance_from_trace_point);
    const distanceAlongEdge = optionalFinite(rawPoint.distance_along_edge);
    const type = typeof rawPoint.type === 'string' ? rawPoint.type : 'unmatched';
    const matchedEdge = edgeIndex !== null && Number.isInteger(edgeIndex) ? edges[edgeIndex] : null;

    return {
      sampleId: sample.id,
      latitude,
      longitude,
      matchType: latitude !== null && longitude !== null ? type : 'unmatched',
      distanceFromRawMeters: distance,
      edgeIndex: edgeIndex !== null && Number.isInteger(edgeIndex) ? edgeIndex : null,
      edgeId: matchedEdge ? matchedEdge.edgeId : null,
      distanceAlongEdge,
      roadBearingDegrees: matchedEdge
        ? interpolatedHeading(matchedEdge.beginHeading, matchedEdge.endHeading, distanceAlongEdge)
        : null,
      isRoundabout: matchedEdge ? matchedEdge.isRoundabout : false,
    };
  });

  const matchedCount = matchedPoints.filter((point) => point.matchType !== 'unmatched').length;
  const status = matchedCount === matchedPoints.length ? 'matched' : matchedCount > 0 ? 'partial' : 'unmatched';

  const roadNames = [...new Set(edges.flatMap((edge) => edge.names))].slice(0, 16);
  const shape = typeof upstream.shape === 'string' ? upstream.shape : null;

  return {
    requestId: request.requestId,
    sessionGeneration: request.sessionGeneration,
    routeId: request.routeId,
    sequenceId: request.sequenceId,
    status,
    matchedPoints,
    edges: edges.map(({ edgeIndex, edgeId, names, beginHeading, endHeading, forward, wayId, isRoundabout }) => ({
      edgeIndex, edgeId, names, beginHeading, endHeading, forward, wayId, isRoundabout,
    })),
    shape,
    roadNames,
  };
}

module.exports = {
  ContractError,
  MAX_SAMPLES,
  MIN_SAMPLES,
  validateMapMatchRequest,
  buildValhallaRequest,
  translateValhallaResponse,
};
