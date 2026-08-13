const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ContractError,
  MAX_SAMPLES,
  validateMapMatchRequest,
  buildUpstreamRequest,
  translateUpstreamResponse,
} = require('../src/modules/navigation/mapMatch.contract');

const validBody = {
  requestId: 'req-1',
  sessionGeneration: 'sess-1',
  routeId: 'route-1',
  sequenceId: 1,
  costing: 'auto',
  gpsAccuracyMeters: 8,
  searchRadiusMeters: 30,
  samples: [
    { id: 's1', latitude: 40.7128, longitude: -74.006, timestamp: 1000, accuracyMeters: 8, speedMps: 8, headingDegrees: 45, headingAccuracyDegrees: 10 },
    { id: 's2', latitude: 40.713, longitude: -74.0055, timestamp: 1005, accuracyMeters: 8, speedMps: 8, headingDegrees: 45, headingAccuracyDegrees: 10 },
  ],
};

test('validateMapMatchRequest accepts a well-formed request', () => {
  const result = validateMapMatchRequest(validBody);
  assert.equal(result.requestId, 'req-1');
  assert.equal(result.samples.length, 2);
});

test('validateMapMatchRequest rejects non-auto costing', () => {
  assert.throws(
    () => validateMapMatchRequest({ ...validBody, costing: 'bicycle' }),
    ContractError
  );
});

test(`validateMapMatchRequest rejects fewer than 2 or more than ${MAX_SAMPLES} samples`, () => {
  assert.throws(() => validateMapMatchRequest({ ...validBody, samples: [validBody.samples[0]] }), ContractError);
  const tooMany = Array.from({ length: MAX_SAMPLES + 1 }, (_, i) => ({ ...validBody.samples[0], id: `s${i}`, timestamp: 1000 + i }));
  assert.throws(() => validateMapMatchRequest({ ...validBody, samples: tooMany }), ContractError);
});

test('validateMapMatchRequest rejects duplicate sample ids', () => {
  const duplicateSamples = [validBody.samples[0], { ...validBody.samples[1], id: validBody.samples[0].id }];
  assert.throws(() => validateMapMatchRequest({ ...validBody, samples: duplicateSamples }), ContractError);
});

test('validateMapMatchRequest rejects non-increasing timestamps', () => {
  const badSamples = [
    validBody.samples[0],
    { ...validBody.samples[1], timestamp: validBody.samples[0].timestamp },
  ];
  assert.throws(() => validateMapMatchRequest({ ...validBody, samples: badSamples }), ContractError);
});

test('validateMapMatchRequest rejects out-of-range coordinates and control characters in ids', () => {
  assert.throws(
    () => validateMapMatchRequest({ ...validBody, samples: [{ ...validBody.samples[0], latitude: 91 }, validBody.samples[1]] }),
    ContractError
  );
  assert.throws(
    () => validateMapMatchRequest({ ...validBody, requestId: `req${String.fromCharCode(0)}1` }),
    ContractError
  );
});

test('buildUpstreamRequest produces a map_snap trace_attributes body', () => {
  const request = validateMapMatchRequest(validBody);
  const upstream = buildUpstreamRequest(request);
  assert.equal(upstream.shape_match, 'map_snap');
  assert.equal(upstream.shape.length, 2);
  assert.equal(upstream.shape[0].lat, 40.7128);
  assert.equal(upstream.trace_options.search_radius, 30);
});

test('translateUpstreamResponse maps matched upstream output to the public contract', () => {
  const request = validateMapMatchRequest(validBody);
  const upstream = {
    matched_points: [
      { lat: 40.7128, lon: -74.006, type: 'matched', edge_index: 0, distance_from_trace_point: 0 },
      { lat: 40.713, lon: -74.0055, type: 'matched', edge_index: 1, distance_from_trace_point: 1.2 },
    ],
    edges: [{ edge_index: 0, names: ['Main St'], begin_heading: 45, end_heading: 46, forward: true, way_id: '123' }],
  };
  const response = translateUpstreamResponse(request, upstream);
  assert.equal(response.status, 'matched');
  assert.equal(response.matchedPoints.length, 2);
  assert.equal(response.matchedPoints[0].sampleId, 's1');
  assert.deepEqual(response.edges[0].names, ['Main St']);
});

test('translateUpstreamResponse derives road bearing, edgeId, and roundabout flag for curve tracking', () => {
  const request = validateMapMatchRequest(validBody);
  const upstream = {
    shape: 'encoded-polyline-geometry',
    matched_points: [
      { lat: 40.7128, lon: -74.006, type: 'matched', edge_index: 0, distance_along_edge: 0, distance_from_trace_point: 0 },
      { lat: 40.713, lon: -74.0055, type: 'matched', edge_index: 0, distance_along_edge: 0.5, distance_from_trace_point: 0 },
    ],
    edges: [
      { edge_index: 0, names: ['Curve Rd'], begin_heading: 350, end_heading: 20, forward: true, way_id: '123', id: 'edge-abc', roundabout: true },
    ],
  };
  const response = translateUpstreamResponse(request, upstream);

  assert.equal(response.shape, 'encoded-polyline-geometry');
  assert.deepEqual(response.roadNames, ['Curve Rd']);
  assert.equal(response.edges[0].edgeId, 'edge-abc');
  assert.equal(response.edges[0].isRoundabout, true);

  // heading interpolated across the shorter arc (350 -> 20 wraps through 0,
  // not the long way through 180) - at 50% along the edge, expect ~5deg.
  assert.equal(response.matchedPoints[0].roadBearingDegrees, 350);
  assert.equal(response.matchedPoints[1].roadBearingDegrees, 5);
  assert.equal(response.matchedPoints[1].edgeId, 'edge-abc');
  assert.equal(response.matchedPoints[1].distanceAlongEdge, 0.5);
  assert.equal(response.matchedPoints[1].isRoundabout, true);
});

test('translateUpstreamResponse reports partial/unmatched status correctly', () => {
  const request = validateMapMatchRequest(validBody);
  const partialUpstream = {
    matched_points: [
      { lat: 40.7128, lon: -74.006, type: 'matched', edge_index: 0, distance_from_trace_point: 0 },
      {},
    ],
    edges: [],
  };
  assert.equal(translateUpstreamResponse(request, partialUpstream).status, 'partial');

  const unmatchedUpstream = { matched_points: [{}, {}], edges: [] };
  assert.equal(translateUpstreamResponse(request, unmatchedUpstream).status, 'unmatched');
});
