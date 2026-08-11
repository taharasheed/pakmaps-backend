const path = require('path');
const env = require('../../config/env');
const asyncHandler = require('../../utils/asyncHandler');
const AppError = require('../../utils/AppError');
const { ok } = require('../../utils/apiResponse');
const { ImageryLayer } = require('../../db/models');
const mbtilesReader = require('./mbtilesReader');

const CONTENT_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  pbf: 'application/x-protobuf',
};

// What the app fetches once to discover which custom layers exist and are
// live - same "descriptor first, tiles after" shape as the base tiles
// endpoint (tiles.controller.js), kept as its own route rather than added
// there so the core basemap path stays untouched.
const listEnabledLayers = asyncHandler(async (req, res) => {
  const layers = await ImageryLayer.findAll({
    where: { isEnabled: true },
    order: [['name', 'ASC']],
  });

  const data = layers.map((layer) => ({
    id: layer.id,
    name: layer.name,
    slug: layer.slug,
    // The client needs this to know HOW to render the layer - a raster
    // image source vs a vector source are not interchangeable - and for
    // vector layers, which source-layer names actually exist inside the
    // tiles (there is no way to render a vector source without them).
    tileFormat: layer.tileFormat,
    vectorLayers: layer.vectorLayers,
    minZoom: layer.minZoom,
    maxZoom: layer.maxZoom,
    bounds: [layer.boundsWest, layer.boundsSouth, layer.boundsEast, layer.boundsNorth],
    tileUrlTemplate: `${req.protocol}://${req.get('host')}/api/v1/proxy/imagery-layers/${layer.id}/{z}/{x}/{y}`,
  }));

  return ok(res, data);
});

// Deliberately does NOT require isEnabled - the admin panel's preview needs
// to fetch tiles for a layer before it goes live (the whole point of
// "preview it, then enable it"). This is still safe: it sits behind
// proxyAuthMiddleware like every other tile route, and the app itself only
// ever learns a layer's id via listEnabledLayers above, which does filter
// on isEnabled - so a disabled layer's tiles are reachable only by someone
// who is both authenticated and already has that specific id (i.e. an
// admin who just uploaded it), never by the public app.
const getTile = asyncHandler(async (req, res) => {
  const layer = await ImageryLayer.findByPk(req.params.id);
  if (!layer) throw new AppError('Layer not found.', 404);

  const z = Number(req.params.z);
  const x = Number(req.params.x);
  const y = Number(req.params.y);
  if (![z, x, y].every(Number.isInteger) || z < 0 || x < 0 || y < 0) {
    throw new AppError('Invalid tile coordinates.', 400);
  }
  if (z < layer.minZoom || z > layer.maxZoom) {
    throw new AppError("Zoom level outside this layer's range.", 404);
  }

  const filePath = path.join(env.IMAGERY_LAYERS_DIR, layer.storedFilename);
  const tile = mbtilesReader.readTile(filePath, z, x, y);
  if (!tile) throw new AppError('Tile not found.', 404);

  res.set('Content-Type', CONTENT_TYPES[layer.tileFormat] || 'application/octet-stream');
  // Vector (pbf) tiles from OpenMapTiles/MapTiler-style exports are stored
  // gzip-compressed inside the mbtiles blob itself (standard practice, not
  // an error condition) - Content-Encoding tells the browser to transparently
  // decompress before MapLibre's vector-tile worker ever sees the bytes.
  // Detected by magic number rather than assumed from format, since the
  // spec allows either compressed or raw pbf storage.
  if (tile.length >= 2 && tile[0] === 0x1f && tile[1] === 0x8b) {
    res.set('Content-Encoding', 'gzip');
  }
  // Static once a layer is uploaded and enabled - re-uploading always
  // produces a new layer row/id rather than mutating one in place, so this
  // is safe to cache aggressively.
  res.set('Cache-Control', 'public, max-age=86400, immutable');
  return res.status(200).send(tile);
});

module.exports = { listEnabledLayers, getTile };
