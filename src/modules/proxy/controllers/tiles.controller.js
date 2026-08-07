const asyncHandler = require('../../../utils/asyncHandler');
const AppError = require('../../../utils/AppError');
const { getServiceBySlug } = require('../registry');
const { TILE_STYLES } = require('../adapters/tiles.adapter');
const { handleProxyRequest } = require('../gateway');

const serveTileImage = handleProxyRequest('tiles');

// Single public endpoint for a style: with ?z=&x=&y= it serves the actual
// raster tile (full auth/rate-limit/cache/proxy pipeline, unchanged from
// before - see tiles.adapter.js). Without them it returns a style
// descriptor whose tiles template points back at this same endpoint with
// {z}/{x}/{y} query placeholders, so a native map engine that consumes a
// style.json can derive every tile request from this one URL - the client
// never has to know a z/x/y path shape exists.
const getTiles = asyncHandler(async (req, res, next) => {
  const { z, x, y } = req.query;
  if (z !== undefined && x !== undefined && y !== undefined) {
    return serveTileImage(req, res, next);
  }

  const { style } = req.params;
  if (!TILE_STYLES.includes(style)) throw new AppError('Unknown tile style.', 404);

  const service = await getServiceBySlug('tiles');
  if (!service) throw new AppError("Unknown service 'tiles'.", 404);
  if (!service.isEnabled) throw new AppError("The 'Tiles' service is currently disabled.", 503);

  const publicTileTemplate = `${req.protocol}://${req.get('host')}/api/v1/proxy/tiles/${style}?z={z}&x={x}&y={y}`;

  const styleJson = {
    version: 8,
    name: style,
    sources: {
      [style]: {
        type: 'raster',
        tiles: [publicTileTemplate],
        tileSize: 256,
        attribution: 'MapifyIt',
      },
    },
    layers: [{ id: style, type: 'raster', source: style }],
  };

  return res.status(200).json({ success: true, message: 'OK', data: styleJson });
});

module.exports = { getTiles };
