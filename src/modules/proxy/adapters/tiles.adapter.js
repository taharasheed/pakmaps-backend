const { z } = require('zod');

// Names match the tile server's actual style ids exactly (TileServer GL,
// serving /styles/:id/style.json + /styles/:id/:z/:x/:y.png) - no translation
// layer between our public contract and upstream.
const TILE_STYLES = ['dark', 'bright', 'satellite'];

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

// Requesting the upstream's @2x variant unconditionally - rather than
// exposing a ratio param on our own contract - means every existing client
// gets sharp tiles on retina/high-DPI screens with zero app-side change: the
// tileSize declared in getTiles' style.json (see tiles.controller.js) is what
// tells MapLibre/Mapbox SDKs the real pixel size of the same z/x/y tile, so
// bumping that from 256 to 512 is the only "client" change needed, and it's
// served from our own style.json response, not the app's code.
function buildUpstreamRequest(input, service) {
  return {
    method: 'GET',
    url: `${service.baseUrl}/styles/${input.style}/${input.z}/${input.x}/${input.y}@2x.png`,
  };
}

// Prefixed so this doesn't collide with cache entries written by the old
// (pre-retina) adapter still sitting in Redis with up to a 6h TTL - without
// this, users would keep getting stale low-res tiles served from cache for
// hours after deploy instead of the fix taking effect immediately.
function cacheKeyParts(input) {
  return `2x:${input.style}:${input.z}:${input.x}:${input.y}`;
}

function activitySummary(input) {
  return { style: input.style, z: input.z, x: input.x, y: input.y };
}

module.exports = { isBinary, parseInput, buildUpstreamRequest, cacheKeyParts, activitySummary, TILE_STYLES };
