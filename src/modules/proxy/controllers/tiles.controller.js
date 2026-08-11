const asyncHandler = require('../../../utils/asyncHandler');
const AppError = require('../../../utils/AppError');
const { getServiceBySlug } = require('../registry');
const { TILE_STYLES } = require('../adapters/tiles.adapter');
const { handleProxyRequest } = require('../gateway');

const serveTileImage = handleProxyRequest('tiles');

// Single route for a style: /tiles/:style{/:z/:x/:y} (Express 5 optional
// path-segment group - matches with all three present or none, never a
// partial). With z/x/y it serves the actual raster tile through the same
// auth/rate-limit/cache/proxy pipeline as every other proxied service (see
// tiles.adapter.js - unchanged, still reads z/x/y from req.params). Without
// them it returns a style descriptor whose tiles template points back at
// this same path shape, so MapLibre GL JS (or any style.json-consuming
// client) can derive every tile request from the one style fetch.
const getTiles = asyncHandler(async (req, res, next) => {
  const { z, x, y } = req.params;
  if (z !== undefined && x !== undefined && y !== undefined) {
    return serveTileImage(req, res, next);
  }

  const { style } = req.params;
  if (!TILE_STYLES.includes(style)) throw new AppError('Unknown tile style.', 404);

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
        // Upstream is now always fetched at @2x (see tiles.adapter.js) - the
        // URL/zxy addressing is unchanged, each tile is just genuinely
        // higher pixel density, so tileSize must say 512 to match or the
        // SDK will overzoom/underzoom by one level when picking tiles.
        tileSize: 512,
        attribution: 'MapifyIt',
      },
    },
    layers: [{ id: style, type: 'raster', source: style }],
  };

  return res.status(200).json({ success: true, message: 'OK', data: styleJson });
});

module.exports = { getTiles };
