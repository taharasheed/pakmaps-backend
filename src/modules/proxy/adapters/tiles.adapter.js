const { z } = require('zod');

const TILE_STYLES = ['dark', 'light', 'satellite'];

const paramsSchema = z.object({
  style: z.enum(TILE_STYLES),
  z: z.coerce.number().int().min(0).max(22),
  x: z.coerce.number().int().min(0),
  y: z.coerce.number().int().min(0),
});

const isBinary = true;

function parseInput(req) {
  return paramsSchema.parse(req.params);
}

function buildUpstreamRequest(input, service) {
  return {
    method: 'GET',
    url: `${service.baseUrl}/${input.style}/${input.z}/${input.x}/${input.y}`,
  };
}

function cacheKeyParts(input) {
  return `${input.style}:${input.z}:${input.x}:${input.y}`;
}

function activitySummary(input) {
  return { style: input.style, z: input.z, x: input.x, y: input.y };
}

module.exports = { isBinary, parseInput, buildUpstreamRequest, cacheKeyParts, activitySummary, TILE_STYLES };
