const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { NotificationApp } = require('../db/models');
const { extractPrefix, verifyApiKey } = require('../utils/apiKey');

const lastUsedTouch = new Map();
const TOUCH_DEBOUNCE_MS = 60 * 1000;

// Server-to-server auth for integrated apps, entirely separate from the
// browser-session JWT flow in auth.middleware.js - a raw API key in a header,
// not a cookie/bearer session token.
const apiKeyAuthMiddleware = asyncHandler(async (req, res, next) => {
  const rawKey = req.headers['x-api-key'];
  if (!rawKey) throw new AppError('API key required.', 401);

  const prefix = extractPrefix(rawKey);
  if (!prefix) throw new AppError('Invalid API key.', 401);

  const app = await NotificationApp.scope('withKeyHash').findOne({ where: { keyPrefix: prefix, isActive: true } });
  if (!app || !verifyApiKey(rawKey, app.keyHash)) {
    throw new AppError('Invalid API key.', 401);
  }

  const lastTouch = lastUsedTouch.get(app.id) || 0;
  if (Date.now() - lastTouch > TOUCH_DEBOUNCE_MS) {
    lastUsedTouch.set(app.id, Date.now());
    app.update({ lastUsedAt: new Date() }).catch(() => {});
  }

  req.integrationApp = app;
  next();
});

module.exports = { apiKeyAuthMiddleware };
