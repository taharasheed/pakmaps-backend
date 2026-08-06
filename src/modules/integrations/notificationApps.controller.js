const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/apiResponse');
const AppError = require('../../utils/AppError');
const { NotificationApp } = require('../../db/models');
const { generateApiKey } = require('../../utils/apiKey');
const { recordAudit } = require('../audit/audit.service');

const listApps = asyncHandler(async (req, res) => {
  const apps = await NotificationApp.findAll({ order: [['createdAt', 'DESC']] });
  return ok(res, apps);
});

// The raw key is only ever returned here, at creation time - only its hash is
// stored, so this is the one and only chance the caller has to see it.
const createApp = asyncHandler(async (req, res) => {
  const { rawKey, keyPrefix, keyHash } = generateApiKey();

  const app = await NotificationApp.create({
    name: req.body.name,
    keyPrefix,
    keyHash,
    createdByUserId: req.user.id,
  });

  await recordAudit({ req, user: req.user, action: 'create', entityType: 'notification_app', entityId: app.id, changes: { name: app.name } });
  return created(res, { app, apiKey: rawKey }, 'Integration app registered. Copy the API key now - it will not be shown again.');
});

const updateApp = asyncHandler(async (req, res) => {
  const app = await NotificationApp.findByPk(req.params.id);
  if (!app) throw new AppError('Integration app not found.', 404);

  await app.update(req.body);

  await recordAudit({ req, user: req.user, action: 'update', entityType: 'notification_app', entityId: app.id, changes: req.body });
  return ok(res, app, 'Integration app updated.');
});

// Issues a new key for an existing app and invalidates the old one immediately
// (old key's hash is overwritten, so it stops verifying on the very next call).
const rotateAppKey = asyncHandler(async (req, res) => {
  const app = await NotificationApp.findByPk(req.params.id);
  if (!app) throw new AppError('Integration app not found.', 404);

  const { rawKey, keyPrefix, keyHash } = generateApiKey();
  await app.update({ keyPrefix, keyHash });

  await recordAudit({ req, user: req.user, action: 'update', entityType: 'notification_app', entityId: app.id, changes: { rotatedKey: true } });
  return ok(res, { app, apiKey: rawKey }, 'API key rotated. Copy it now - it will not be shown again.');
});

const deleteApp = asyncHandler(async (req, res) => {
  const app = await NotificationApp.findByPk(req.params.id);
  if (!app) throw new AppError('Integration app not found.', 404);

  await app.destroy();

  await recordAudit({ req, user: req.user, action: 'delete', entityType: 'notification_app', entityId: req.params.id });
  return ok(res, null, 'Integration app deleted.');
});

module.exports = { listApps, createApp, updateApp, rotateAppKey, deleteApp };
