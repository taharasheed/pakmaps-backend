const { z } = require('zod');

const VECTOR_STYLES = ['dark', 'bright'];

// Real data caps out at z14 (confirmed against the renderer's own tilejson
// metadata) - the upstream 404s past that rather than overzooming itself, so
// there's no point accepting a wider range here just to forward failures.
const paramsSchema = z.object({
  style: z.enum(VECTOR_STYLES),
  z: z.coerce.number().int().min(0).max(14),
  x: z.coerce.number().int().min(0),
  y: z.coerce.number().int().min(0),
});

const isBinary = true;

function parseInput(req) {
  return paramsSchema.parse(req.params);
}

// The vector geometry itself is identical regardless of style - "dark" vs
// "bright" only changes client-side paint rules, not the underlying data -
// so style is deliberately left out of the upstream request and cache key
// below. It still has to be validated and accepted in the URL/paramsSchema
// so the route shape matches the raster tiles endpoint and a bad style name
// still 400s cleanly instead of silently serving unrelated data.
function buildUpstreamRequest(input, service) {
  return {
    method: 'GET',
    url: `${service.baseUrl}/data/openmaptiles/${input.z}/${input.x}/${input.y}.pbf`,
  };
}

function cacheKeyParts(input) {
  return `${input.z}:${input.x}:${input.y}`;
}

function activitySummary(input) {
  return { style: input.style, z: input.z, x: input.x, y: input.y };
}

module.exports = {
  isBinary,
  parseInput,
  buildUpstreamRequest,
  cacheKeyParts,
  activitySummary,
  VECTOR_STYLES,
};
