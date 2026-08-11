const asyncHandler = require('../../../utils/asyncHandler');
const AppError = require('../../../utils/AppError');
const env = require('../../../config/env');
const { getServiceBySlug } = require('../registry');
const { TILE_STYLES } = require('../adapters/tiles.adapter');
const { VECTOR_STYLES } = require('../adapters/vectorTiles.adapter');
const { handleProxyRequest } = require('../gateway');
const { upstreamFetch } = require('../httpClient');

const serveTileImage = handleProxyRequest('tiles');
// Shares the 'tiles' service (config, rate limit, and the audit/activity
// log's service identity) with the raster path, but still runs the vector
// adapter's fetch/cache logic. Both raster and vector requests show up as
// the single "Tiles" service everywhere an admin would look; which style
// was actually hit is still visible per request via activitySummary.
const serveVectorTile = handleProxyRequest('tiles', 'tilesVector');

// satellite is real photography - there's no vector equivalent, so it's the
// only style still served as a flat raster image. Its real data caps out at
// z13 (from the renderer's own tilejson metadata).
const ZOOM_RANGES = {
  satellite: { minzoom: 5, maxzoom: 13 },
};

// Fetches the real upstream style (including its building-3d fill-extrusion
// layer, verbatim) and rewrites the handful of fields that hardcode
// internal-only addresses: the vector source points back at our own public
// tile endpoint, and glyphs/sprite point at the existing public tiles
// domain, since those are generic font/icon assets already served there
// unauthenticated.
async function buildVectorStyleJson(style, req) {
  const service = await getServiceBySlug('tiles');
  if (!service) throw new AppError("Unknown service 'tiles'.", 404);
  if (!service.isEnabled) throw new AppError("The 'Tiles' service is currently disabled.", 503);

  const upstreamRes = await upstreamFetch(`${service.baseUrl}/styles/${style}/style.json`);
  if (!upstreamRes.ok) throw new AppError('Upstream style unavailable.', 502);
  const upstream = await upstreamRes.json();

  const tileUrlBase = `${req.protocol}://${req.get('host')}/api/v1/proxy/tiles/${style}`;

  return {
    ...upstream,
    sources: {
      ...upstream.sources,
      openmaptiles: {
        type: 'vector',
        tiles: [`${tileUrlBase}/{z}/{x}/{y}`],
        minzoom: 0,
        maxzoom: 14,
      },
    },
    glyphs: `${env.TILES_PUBLIC_ASSET_BASE_URL}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${env.TILES_PUBLIC_ASSET_BASE_URL}/styles/${style}/sprite`,
  };
}

// Single route for a style: /tiles/:style{/:z/:x/:y} (Express 5 optional
// path-segment group - matches with all three present or none, never a
// partial). dark/bright now serve real vector data directly here (including
// 3D buildings) rather than a flattened picture - every app build hitting
// this endpoint gets vector from here on, by deliberate decision (the
// installs still on the old raster response were testing-only). satellite
// is unaffected and still returns a flat raster image, since it's real
// imagery with no vector equivalent.
const getTiles = asyncHandler(async (req, res, next) => {
  const { style } = req.params;
  if (!TILE_STYLES.includes(style)) throw new AppError('Unknown tile style.', 404);

  if (VECTOR_STYLES.includes(style)) {
    const { z, x, y } = req.params;
    if (z !== undefined && x !== undefined && y !== undefined) {
      return serveVectorTile(req, res, next);
    }
    const styleJson = await buildVectorStyleJson(style, req);
    return res.status(200).json({ success: true, message: 'OK', data: styleJson });
  }

  const { z, x, y } = req.params;
  if (z !== undefined && x !== undefined && y !== undefined) {
    return serveTileImage(req, res, next);
  }

  const service = await getServiceBySlug('tiles');
  if (!service) throw new AppError("Unknown service 'tiles'.", 404);
  if (!service.isEnabled) throw new AppError("The 'Tiles' service is currently disabled.", 503);

  const publicTileTemplate = `${req.protocol}://${req.get('host')}/api/v1/proxy/tiles/${style}/{z}/{x}/{y}`;

  const styleJson = {
    version: 8,
    name: style,
    sources: {
      [style]: {
        type: 'raster',
        tiles: [publicTileTemplate],
        // Upstream is fetched at @2x (see tiles.adapter.js) - the URL/zxy
        // addressing is unchanged, each tile is just genuinely higher pixel
        // density, so tileSize must say 512 to match or the SDK will
        // overzoom/underzoom by one level when picking tiles.
        tileSize: 512,
        attribution: 'MapifyIt',
        ...ZOOM_RANGES[style],
      },
    },
    layers: [{ id: style, type: 'raster', source: style }],
  };

  return res.status(200).json({ success: true, message: 'OK', data: styleJson });
});

module.exports = { getTiles };
