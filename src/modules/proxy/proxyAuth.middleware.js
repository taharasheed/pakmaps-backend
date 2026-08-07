const crypto = require('crypto');
const fs = require('fs');
const env = require('../../config/env');
const { authMiddleware } = require('../../middleware/auth.middleware');

let fileToken;

function constantTimeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function proxyAuthMiddleware(req, res, next) {
  const authorization = String(req.headers.authorization || '');
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const isV10RoutingCallback = isInternalRoutingCallback(req);

  const internalToken = getInternalToken();
  if (
    isV10RoutingCallback
    && internalToken
    && constantTimeEqual(bearer, internalToken)
  ) {
    req.auth = { clientType: 'v10-internal', service: 'mapify-v10' };
    return next();
  }

  return authMiddleware(req, res, next);
}

function isInternalRoutingCallback(req) {
  const originalPath = String(req.originalUrl || '').split('?', 1)[0];
  const allowedPaths = new Set([
    '/routing',
    '/v1/proxy/routing',
    '/api/v1/proxy/routing',
  ]);
  return req.method === 'POST'
    && (allowedPaths.has(req.path) || allowedPaths.has(originalPath));
}

function getInternalToken() {
  if (env.MAPIFY_V10_INTERNAL_TOKEN) return env.MAPIFY_V10_INTERNAL_TOKEN;
  if (!env.MAPIFY_V10_INTERNAL_TOKEN_FILE) return '';
  if (fileToken === undefined) {
    fileToken = fs.readFileSync(env.MAPIFY_V10_INTERNAL_TOKEN_FILE, 'utf8').trim();
    if (fileToken.length < 32) throw new Error('Mapify V10 internal token file is invalid');
  }
  return fileToken;
}

module.exports = {
  proxyAuthMiddleware,
  constantTimeEqual,
  getInternalToken,
  isInternalRoutingCallback,
};
