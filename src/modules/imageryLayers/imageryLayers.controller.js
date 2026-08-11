const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const env = require('../../config/env');
const asyncHandler = require('../../utils/asyncHandler');
const AppError = require('../../utils/AppError');
const { ok, created } = require('../../utils/apiResponse');
const { ImageryLayer } = require('../../db/models');
const { recordAudit } = require('../audit/audit.service');
const { uploadMetaSchema, slugify } = require('./imageryLayers.validation');
const mbtilesReader = require('./mbtilesReader');

fs.mkdirSync(env.IMAGERY_LAYERS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, env.IMAGERY_LAYERS_DIR),
  // Generated name, never the client-supplied filename - the original is
  // kept only as a display string in the DB, so there is no path-traversal
  // or overwrite surface from what a client names their file.
  filename: (req, file, cb) => cb(null, `${uuidv4()}.mbtiles`),
});

const upload = multer({
  storage,
  limits: { fileSize: env.IMAGERY_LAYERS_MAX_BYTES },
  fileFilter: (req, file, cb) => {
    if (!file.originalname.toLowerCase().endsWith('.mbtiles')) {
      return cb(new AppError('Only .mbtiles files are accepted.', 422));
    }
    cb(null, true);
  },
}).single('file');

// Wraps multer's callback-style middleware so its errors (file too large,
// wrong extension) flow through the same asyncHandler -> AppError -> global
// error handler path as everything else, instead of a separate shape.
const uploadMiddleware = (req, res, next) => {
  upload(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      const maxMb = Math.floor(env.IMAGERY_LAYERS_MAX_BYTES / (1024 * 1024));
      return next(new AppError(`File exceeds the ${maxMb}MB limit.`, 413));
    }
    if (err instanceof AppError) return next(err);
    return next(new AppError('Upload failed.', 400));
  });
};

const listLayers = asyncHandler(async (req, res) => {
  const layers = await ImageryLayer.findAll({ order: [['createdAt', 'DESC']] });
  return ok(res, layers);
});

const getLayer = asyncHandler(async (req, res) => {
  const layer = await ImageryLayer.findByPk(req.params.id);
  if (!layer) throw new AppError('Layer not found.', 404);
  return ok(res, layer);
});

const uploadLayer = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError('No file uploaded (expected field "file").', 400);

  const filePath = path.join(env.IMAGERY_LAYERS_DIR, req.file.filename);
  const cleanup = () => fs.unlink(filePath, () => {});

  let meta;
  try {
    meta = uploadMetaSchema.parse(req.body);
  } catch (caught) {
    cleanup();
    throw caught;
  }

  let mbtilesMeta;
  try {
    mbtilesMeta = mbtilesReader.validateAndExtractMetadata(filePath);
  } catch (caught) {
    cleanup();
    throw caught;
  }

  const layer = await ImageryLayer.create({
    name: meta.name,
    slug: slugify(meta.name),
    description: meta.description || null,
    storedFilename: req.file.filename,
    originalFilename: req.file.originalname,
    fileSizeBytes: req.file.size,
    tileFormat: mbtilesMeta.format,
    minZoom: mbtilesMeta.minZoom,
    maxZoom: mbtilesMeta.maxZoom,
    boundsWest: mbtilesMeta.bounds?.west ?? null,
    boundsSouth: mbtilesMeta.bounds?.south ?? null,
    boundsEast: mbtilesMeta.bounds?.east ?? null,
    boundsNorth: mbtilesMeta.bounds?.north ?? null,
    vectorLayers: mbtilesMeta.vectorLayers,
    isEnabled: false, // admin reviews the preview before making it live
    uploadedBy: req.user.id,
  });

  await recordAudit({
    req,
    user: req.user,
    action: 'create',
    entityType: 'imagery_layer',
    entityId: layer.id,
    changes: { name: meta.name, fileSizeBytes: req.file.size, tileFormat: mbtilesMeta.format },
  });

  return created(res, layer, 'Layer uploaded. Preview it, then enable it to make it live.');
});

const toggleLayer = asyncHandler(async (req, res) => {
  const layer = await ImageryLayer.findByPk(req.params.id);
  if (!layer) throw new AppError('Layer not found.', 404);

  await layer.update({ isEnabled: req.body.isEnabled });

  await recordAudit({
    req,
    user: req.user,
    action: 'update',
    entityType: 'imagery_layer',
    entityId: layer.id,
    changes: { isEnabled: req.body.isEnabled },
  });

  return ok(res, layer, `Layer ${req.body.isEnabled ? 'enabled' : 'disabled'}.`);
});

const deleteLayer = asyncHandler(async (req, res) => {
  const layer = await ImageryLayer.findByPk(req.params.id);
  if (!layer) throw new AppError('Layer not found.', 404);

  const filePath = path.join(env.IMAGERY_LAYERS_DIR, layer.storedFilename);
  mbtilesReader.closeHandle(filePath);
  fs.unlink(filePath, () => {});

  await layer.destroy();

  await recordAudit({ req, user: req.user, action: 'delete', entityType: 'imagery_layer', entityId: req.params.id });
  return ok(res, null, 'Layer deleted.');
});

module.exports = { uploadMiddleware, listLayers, getLayer, uploadLayer, toggleLayer, deleteLayer };
