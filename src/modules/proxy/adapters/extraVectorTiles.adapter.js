const { z } = require('zod');

// Generic proxy for vector sources beyond the primary 'openmaptiles' one
// (which vectorTiles.adapter.js already handles). tileserver-gl resolves
// every mbtiles:// source to an address only reachable from inside this
// host's docker network, so any source added to the style needs a public
// passthrough or external clients (the mobile app, browsers off-host) can
// never fetch its tiles - this covers that for all of them through one
// route instead of adding a dedicated adapter/route per new source.
//
// 'source' is validated against a small allowlist rather than accepted
// free-form, matching how 'style' is validated elsewhere in this module -
// adding a new source here is a one-line addition, not a new endpoint.
//
// Maps the style.json source id (used in the public URL, e.g.
// 'buildings-tc') to the tileserver's actual data id (used in its
// /data/{id}/... path, e.g. 'buildings_pakistan' - the config.json
// key / mbtiles filename). These are two independently-chosen names for the
// same thing, not the same string, and getting that wrong 404s every tile.
// 'buildings-tc' (the source id / public URL segment) is kept as-is even
// though the dataset behind it is now nationwide, not twin-cities-only -
// renaming it would mean an app-side change for zero functional benefit,
// since the id is just an opaque path segment to any client.
const SOURCE_TO_DATA_ID = {
  'buildings-tc': 'buildings_pakistan',
};
const KNOWN_EXTRA_SOURCES = Object.keys(SOURCE_TO_DATA_ID);

// [west, south, east, north] per source - lets the map SDK skip requesting
// tiles from a source entirely outside this box, rather than firing a
// request (and getting an empty tile back) for every viewer worldwide at
// this source's minzoom. Matches buildings_pakistan.mbtiles's actual bounds
// (from its own tilejson metadata), not a loose guess.
const SOURCE_BOUNDS = {
  'buildings-tc': [60.885042, 23.9669308, 77.0435969, 37.0462197],
};

const paramsSchema = z.object({
  source: z.enum(KNOWN_EXTRA_SOURCES),
  z: z.coerce.number().int().min(0).max(14),
  x: z.coerce.number().int().min(0),
  y: z.coerce.number().int().min(0),
});

const isBinary = true;

// Most z/x/y requests for this source are legitimately empty (buildings
// only exist z13-14, in a fraction of the world's tiles even within that
// range) - tileserver correctly 404s those, but gateway.js treats any
// non-2xx as a breaker failure, so normal client zoom/pan traffic tripped
// the shared circuit breaker for every request on this slug, including ones
// that would've succeeded. Opting out here (2026-08-18, live incident)
// rather than in gateway.js keeps this a property of this one source, not a
// change to how every proxied service's non-2xx responses are treated.
const skipConcurrencyLimit = true;

function parseInput(req) {
  return paramsSchema.parse(req.params);
}

function buildUpstreamRequest(input, service) {
  const dataId = SOURCE_TO_DATA_ID[input.source];
  return {
    method: 'GET',
    url: `${service.baseUrl}/data/${dataId}/${input.z}/${input.x}/${input.y}.pbf`,
  };
}

function cacheKeyParts(input) {
  return `${input.source}:${input.z}:${input.x}:${input.y}`;
}

function activitySummary(input) {
  return { source: input.source, z: input.z, x: input.x, y: input.y };
}

module.exports = {
  isBinary,
  skipConcurrencyLimit,
  parseInput,
  buildUpstreamRequest,
  cacheKeyParts,
  activitySummary,
  KNOWN_EXTRA_SOURCES,
  SOURCE_BOUNDS,
};
