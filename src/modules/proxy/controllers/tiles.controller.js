const asyncHandler = require('../../../utils/asyncHandler');
const AppError = require('../../../utils/AppError');
const { getServiceBySlug } = require('../registry');
const { TILE_STYLES } = require('../adapters/tiles.adapter');

// Style descriptor for a theme - single JSON fetch per map load, mirrors how
// providers like MapTiler/Mapbox expose a style.json separately from the
// per-z/x/y tile images. Synthesized rather than forwarded from the upstream
// tileserver: its native style.json is a vector style whose source/sprite/
// glyph URLs point at host.docker.internal, unreachable outside this VM. We
// only actually serve rasterized PNGs (via /tiles/:style/:z/:x/:y), so this
// just describes that raster source.
const getStyleJson = asyncHandler(async (req, res) => {
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
        tileSize: 256,
        attribution: 'MapifyIt',
      },
    },
    layers: [{ id: style, type: 'raster', source: style }],
  };

  return res.status(200).json({ success: true, message: 'OK', data: styleJson });
});

module.exports = { getStyleJson };
