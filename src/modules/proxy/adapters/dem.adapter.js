const { z } = require('zod');

const pointSchema = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) });

const bodySchema = z.object({
  points: z.array(pointSchema).min(1).max(500),
});

const isBinary = false;

function parseInput(req) {
  return bodySchema.parse(req.body);
}

function buildUpstreamRequest(input, service) {
  const body = { range: false, shape: input.points.map((p) => ({ lat: p.lat, lon: p.lon })) };
  return {
    method: 'POST',
    url: `${service.baseUrl}/height`,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function normalizeResponse(upstreamJson, input) {
  const heights = upstreamJson.height || [];
  return input.points.map((p, i) => ({ lat: p.lat, lon: p.lon, elevationMeters: heights[i] ?? null }));
}

function cacheKeyParts(input) {
  return input.points.map((p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`).join('|');
}

function activitySummary(input) {
  return { pointCount: input.points.length };
}

module.exports = { isBinary, parseInput, buildUpstreamRequest, normalizeResponse, cacheKeyParts, activitySummary };
