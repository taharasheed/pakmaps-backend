const path = require('path');
const env = require('../../config/env');
const asyncHandler = require('../../utils/asyncHandler');
const AppError = require('../../utils/AppError');
const { ok } = require('../../utils/apiResponse');
const { ImageryLayer } = require('../../db/models');
const mbtilesReader = require('./mbtilesReader');
const { getServiceBySlug } = require('../proxy/registry');
const { upstreamFetch } = require('../proxy/httpClient');
const { buildCacheKey, getCached, setCached } = require('../proxy/cache');
const { withConcurrencyLimit } = require('../proxy/concurrencyPool');

const CONTENT_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  pbf: 'application/x-protobuf',
};

// What the app fetches once to discover which custom layers exist and are
// live. Any number of admin-uploaded layers can be enabled at once (e.g. a
// 10m national layer plus a 30cm city layer plus a roads overlay), but the
// app should only ever see ONE selectable entry per tile format - it can't
// pixel-blend two raster sources itself, and juggling N toggles for what is
// conceptually "the imagery" is not how Google/Bing-style maps present this.
// So enabled layers are grouped by tileFormat here into one mosaic
// descriptor per group; getMosaicTile below is what actually picks, per
// tile, which underlying layer's bytes to serve. Same "descriptor first,
// tiles after" shape as the base tiles endpoint (tiles.controller.js), kept
// as its own route rather than added there so the core basemap path stays
// untouched.
const listEnabledLayers = asyncHandler(async (req, res) => {
  const layers = await ImageryLayer.findAll({
    where: { isEnabled: true },
    order: [['priority', 'DESC'], ['maxZoom', 'DESC'], ['createdAt', 'DESC']],
  });

  const groups = new Map(); // tileFormat -> layers[], insertion order = priority order
  for (const layer of layers) {
    if (!groups.has(layer.tileFormat)) groups.set(layer.tileFormat, []);
    groups.get(layer.tileFormat).push(layer);
  }

  const data = [...groups.entries()].map(([format, group]) => {
    // Union bounds/zoom across the group so the client's source covers
    // everywhere any constituent layer does, even though any single tile
    // only ever comes from one of them (see getMosaicTile).
    const bounds = group.reduce(
      (acc, l) => [
        l.boundsWest != null ? Math.min(acc[0], l.boundsWest) : acc[0],
        l.boundsSouth != null ? Math.min(acc[1], l.boundsSouth) : acc[1],
        l.boundsEast != null ? Math.max(acc[2], l.boundsEast) : acc[2],
        l.boundsNorth != null ? Math.max(acc[3], l.boundsNorth) : acc[3],
      ],
      [180, 90, -180, -90]
    );
    const vectorLayerIds = new Set();
    group.forEach((l) => (l.vectorLayers || []).forEach((vl) => vectorLayerIds.add(vl.id)));

    return {
      // Virtual - there's no single ImageryLayer row behind this entry, so
      // it's not a UUID. The app should treat it as an opaque source id.
      id: `mosaic:${format}`,
      name: format === 'pbf' ? 'Map data' : 'Satellite imagery',
      tileFormat: format,
      vectorLayers: vectorLayerIds.size ? [...vectorLayerIds].map((id) => ({ id })) : null,
      minZoom: Math.min(...group.map((l) => l.minZoom)),
      maxZoom: Math.max(...group.map((l) => l.maxZoom)),
      bounds,
      tileUrlTemplate: `${req.protocol}://${req.get('host')}/api/v1/proxy/imagery-layers/mosaic/${format}/{z}/{x}/{y}`,
    };
  });

  return ok(res, data);
});

// Returns tile bytes for one layer, whichever way it's actually stored - a
// local .mbtiles read for 'upload' layers, or a live fetch against the same
// tileserver-gl style the base-map switcher uses for 'proxy' layers. Missing
// data (outside the upstream's real coverage, e.g. requesting satellite_2
// outside Islamabad/Rawalpindi) is a plain 404 from tileserver-gl, folded
// into the same "no tile here" null as a local mbtiles miss so callers (esp.
// getMosaicTile's per-layer fallthrough) don't need to care which it was.
async function readProxyTile(layer, z, x, y) {
  const service = await getServiceBySlug('tiles');
  if (!service || !service.isEnabled) return null;

  // Same cache key shape the base-map "Satellite" style's own proxy route
  // uses for this exact upstream URL (see tiles.adapter.js's cacheKeyParts)
  // - a tile already warmed by someone browsing the base map is reused here
  // for free, and vice versa. Without this, every tile request round-tripped
  // to the upstream tileserver uncached, which is what made this feel slow.
  const cacheable = service.cacheable && service.cacheTtlSeconds > 0;
  const hitKey = cacheable ? buildCacheKey('tiles', `2x:${layer.proxyStyle}:${z}:${x}:${y}`) : null;
  // Misses get their own key, never the shared hit-cache one above - a miss
  // sentinel written under that shared key would corrupt it for the base-map
  // route, which only ever expects a real {body, contentType} tile there.
  // Worth caching separately anyway: the mosaic route tries the smaller,
  // higher-priority ISB/RWP layer first on every tile, which is a real miss
  // (and a real upstream round-trip) for almost all of the country.
  const missKey = cacheable ? buildCacheKey('imagery-layers-proxy', `miss:${layer.proxyStyle}:${z}:${x}:${y}`) : null;

  if (hitKey) {
    const cached = await getCached(hitKey);
    if (cached) return Buffer.from(cached.body, 'base64');
    if (await getCached(missKey)) return null;
  }

  const tile = await withConcurrencyLimit('tiles', service.concurrencyLimit, async () => {
    const res = await upstreamFetch(`${service.baseUrl}/styles/${layer.proxyStyle}/${z}/${x}/${y}@2x.png`);
    if (res.status === 404) return null;
    if (!res.ok) throw new AppError('Upstream imagery service returned an error.', 502);
    return { buf: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type') || 'image/png' };
  });

  if (hitKey) {
    if (tile) setCached(hitKey, { body: tile.buf.toString('base64'), contentType: tile.contentType }, service.cacheTtlSeconds).catch(() => {});
    else setCached(missKey, { miss: true }, service.cacheTtlSeconds).catch(() => {});
  }

  return tile ? tile.buf : null;
}

async function readLayerTile(layer, z, x, y) {
  if (layer.sourceType === 'proxy') return readProxyTile(layer, z, x, y);
  const filePath = path.join(env.IMAGERY_LAYERS_DIR, layer.storedFilename);
  return mbtilesReader.readTile(filePath, z, x, y);
}

function parseTileCoords(params) {
  const z = Number(params.z);
  const x = Number(params.x);
  const y = Number(params.y);
  if (![z, x, y].every(Number.isInteger) || z < 0 || x < 0 || y < 0) {
    throw new AppError('Invalid tile coordinates.', 400);
  }
  return { z, x, y };
}

// A request deeper than a layer's native maxZoom has no real tile of its own
// - rather than 404, resolve it to the layer's deepest real tile that
// actually covers the same spot (standard overzoom: descendant tiles share
// their ancestor's bytes, just displayed more coarsely).
function overzoomTarget(z, x, y, nativeMaxZoom) {
  if (z <= nativeMaxZoom) return { z, x, y };
  const shift = z - nativeMaxZoom;
  return { z: nativeMaxZoom, x: x >> shift, y: y >> shift };
}

function sendTile(res, tile, tileFormat) {
  res.set('Content-Type', CONTENT_TYPES[tileFormat] || 'application/octet-stream');
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
  // is safe to cache aggressively. A mosaic tile is just as static: which
  // layer wins a given z/x/y only changes when an admin edits priority/
  // enabled state, and this response isn't tagged with that state anyway -
  // same caching tradeoff the single-layer route already made.
  res.set('Cache-Control', 'public, max-age=86400, immutable');
  return res.status(200).send(tile);
}

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

  const { z, x, y } = parseTileCoords(req.params);
  if (z < layer.minZoom) {
    throw new AppError("Zoom level outside this layer's range.", 404);
  }

  const target = overzoomTarget(z, x, y, layer.maxZoom);
  const tile = await readLayerTile(layer, target.z, target.x, target.y);
  if (!tile) throw new AppError('Tile not found.', 404);

  return sendTile(res, tile, layer.tileFormat);
});

// Backs the single "mosaic:<format>" source the app actually adds to its
// map. Enabled layers of this format are tried in priority order (highest
// first, same tie-break as listEnabledLayers) and the first one that
// actually has a tile at this z/x/y wins - e.g. a high-priority city layer
// covering only Lahore is tried first everywhere, but only ever produces
// bytes inside Lahore, so requests elsewhere fall through to the next-
// priority (say, national) layer automatically. This also means coverage
// doesn't need to be a clean rectangle matching the declared bounds - a
// layer with a null there just gets skipped, no bounds math required.
const getMosaicTile = asyncHandler(async (req, res) => {
  const { format } = req.params;
  if (!CONTENT_TYPES[format]) throw new AppError('Unknown tile format.', 400);

  const { z, x, y } = parseTileCoords(req.params);

  const layers = await ImageryLayer.findAll({
    where: { isEnabled: true, tileFormat: format },
    order: [['priority', 'DESC'], ['maxZoom', 'DESC'], ['createdAt', 'DESC']],
  });
  if (!layers.length) throw new AppError('No enabled layers for this format.', 404);

  for (const layer of layers) {
    if (z < layer.minZoom || z > layer.maxZoom) continue;
    const tile = await readLayerTile(layer, z, x, y);
    if (tile) return sendTile(res, tile, format);
  }

  // Nothing had real data exactly at this zoom - typically because every
  // layer that reaches this far in has native data that caps out lower than
  // z here (e.g. the national layer past z13 outside the HD region, which
  // has no coverage of its own up there). Rather than a blank tile - which
  // lets whatever sits behind the map bleed through - fall back to the
  // highest-priority layer whose real max zoom is still below z, clamp down
  // to ITS native zoom, and serve that tile: the same overzoom a raster
  // source does natively when a map zooms past its declared maxzoom, just
  // done here since the mosaic's advertised maxzoom spans the whole group.
  for (const layer of layers) {
    if (layer.maxZoom >= z) continue; // already tried at its real zoom above
    const target = overzoomTarget(z, x, y, layer.maxZoom);
    const tile = await readLayerTile(layer, target.z, target.x, target.y);
    if (tile) return sendTile(res, tile, format);
  }

  throw new AppError('Tile not found.', 404);
});

module.exports = { listEnabledLayers, getTile, getMosaicTile };
