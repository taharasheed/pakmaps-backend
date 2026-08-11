// Thin, read-only wrapper around the MBTiles (SQLite) spec:
// https://github.com/mapbox/mbtiles-spec - a `tiles` table keyed by
// zoom_level/tile_column/tile_row (TMS scheme, y flipped from XYZ) and a
// `metadata` key/value table. No writes ever happen through this module -
// files are written once at upload time and read many times after.
const Database = require('better-sqlite3');
const AppError = require('../../utils/AppError');

const REQUIRED_TABLES = ['tiles', 'metadata'];
const VALID_FORMATS = new Set(['png', 'jpg', 'jpeg', 'webp', 'pbf']);

function openReadOnly(filePath) {
  try {
    return new Database(filePath, { readonly: true, fileMustExist: true });
  } catch {
    throw new AppError('File is not a readable SQLite database.', 422);
  }
}

// Validates the uploaded file is a real MBTiles archive and extracts the
// metadata an admin/app needs to render it, without reading any tile data -
// cheap even for a near-1GB file since it only touches the schema and the
// small metadata table.
function validateAndExtractMetadata(filePath) {
  const db = openReadOnly(filePath);
  try {
    // SQLite doesn't always reject a bad file at open time (fileMustExist
    // only checks the file exists, not that it's a valid database) - the
    // header is actually validated on first real query, so that query has
    // to be try/caught here too, not just the open step above.
    // The MBTiles spec allows a "compacted" storage form where the actual
    // tile bytes live in separate map/images tables and `tiles` is exposed
    // as a SQL VIEW joining them (for read compatibility and de-duplication
    // of identical tiles) - common output from mbutil, MapTiler, and other
    // real tools. A view reads identically to a table for every query this
    // module runs, so it has to count as satisfying the requirement too;
    // checking only type='table' would wrongly reject spec-compliant files.
    let tableNames;
    try {
      tableNames = new Set(
        db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view')").all().map((row) => row.name)
      );
    } catch {
      throw new AppError('File is not a readable SQLite database.', 422);
    }
    for (const required of REQUIRED_TABLES) {
      if (!tableNames.has(required)) {
        throw new AppError(`Not a valid MBTiles file - missing required table '${required}'.`, 422);
      }
    }

    const metaRows = db.prepare('SELECT name, value FROM metadata').all();
    const meta = Object.fromEntries(metaRows.map((row) => [row.name, row.value]));

    const format = String(meta.format || '').toLowerCase();
    if (!VALID_FORMATS.has(format)) {
      throw new AppError(`Unsupported or missing tile format in metadata ('${meta.format || 'none'}').`, 422);
    }

    const tileCountRow = db.prepare('SELECT COUNT(*) AS count FROM tiles').get();
    if (!tileCountRow || tileCountRow.count === 0) {
      throw new AppError('MBTiles file contains no tiles.', 422);
    }

    let minZoom = Number(meta.minzoom);
    let maxZoom = Number(meta.maxzoom);
    if (!Number.isFinite(minZoom) || !Number.isFinite(maxZoom)) {
      const zoomRow = db.prepare('SELECT MIN(zoom_level) AS minZ, MAX(zoom_level) AS maxZ FROM tiles').get();
      minZoom = zoomRow.minZ;
      maxZoom = zoomRow.maxZ;
    }

    let bounds = null;
    if (meta.bounds) {
      const parts = meta.bounds.split(',').map(Number);
      if (parts.length === 4 && parts.every(Number.isFinite)) {
        bounds = { west: parts[0], south: parts[1], east: parts[2], north: parts[3] };
      }
    }

    // pbf (vector) tiles have no inherent visual style - unlike a raster
    // tile, the browser can't just decode and paint the bytes. The
    // TileJSON `vector_layers` list (standard for OpenMapTiles/MapTiler-
    // style exports) names each internal source-layer, which is what the
    // admin panel's preview needs to build even a generic style out of.
    let vectorLayers = null;
    if (format === 'pbf' && meta.json) {
      try {
        const parsedJson = JSON.parse(meta.json);
        if (Array.isArray(parsedJson.vector_layers)) {
          vectorLayers = parsedJson.vector_layers.map((vl) => ({ id: String(vl.id) }));
        }
      } catch {
        // Malformed json metadata isn't fatal to the upload - the layer is
        // still valid and servable, it just won't get an auto-generated
        // preview style.
      }
    }

    return { format, minZoom, maxZoom, bounds, vectorLayers, tileCount: tileCountRow.count };
  } finally {
    db.close();
  }
}

// Small cache of open read handles so repeated tile requests for the same
// layer don't reopen the SQLite file every time. Capped and LRU-evicted -
// an admin could in principle have many layers, and each open handle costs
// a file descriptor.
const MAX_OPEN_HANDLES = 20;
const openHandles = new Map(); // filePath -> Database

function getHandle(filePath) {
  if (openHandles.has(filePath)) {
    const db = openHandles.get(filePath);
    openHandles.delete(filePath);
    openHandles.set(filePath, db); // refresh recency
    return db;
  }

  if (openHandles.size >= MAX_OPEN_HANDLES) {
    const oldestPath = openHandles.keys().next().value;
    openHandles.get(oldestPath).close();
    openHandles.delete(oldestPath);
  }

  const db = openReadOnly(filePath);
  openHandles.set(filePath, db);
  return db;
}

// Reads one tile's raw bytes. Returns null if the tile simply doesn't exist
// at that coordinate (a normal, common case at the edges of a layer's
// coverage) rather than throwing.
function readTile(filePath, z, x, y) {
  const db = getHandle(filePath);
  const tmsRow = (2 ** z) - 1 - y; // MBTiles stores rows TMS-style, XYZ requests are top-left origin
  const row = db
    .prepare('SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?')
    .get(z, x, tmsRow);
  return row ? row.tile_data : null;
}

function closeHandle(filePath) {
  if (openHandles.has(filePath)) {
    openHandles.get(filePath).close();
    openHandles.delete(filePath);
  }
}

module.exports = { validateAndExtractMetadata, readTile, closeHandle };
