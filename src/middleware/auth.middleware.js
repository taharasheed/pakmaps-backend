const env = require('../config/env');
const { verifyToken } = require('../utils/jwt');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { User, Role, Session, Permission, Page } = require('../db/models');

const lastActiveTouch = new Map();
const TOUCH_DEBOUNCE_MS = 30 * 1000;

function extractToken(req) {
  if (req.cookies && req.cookies[env.COOKIE_NAME]) return req.cookies[env.COOKIE_NAME];
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7);
  return null;
}

const authMiddleware = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) throw new AppError('Authentication required.', 401);

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw new AppError('Invalid or expired session.', 401);
  }

  let session = null;
  if (payload.sessionId) {
    session = await Session.findByPk(payload.sessionId);
    // A session with no refreshTokenHash predates the access/refresh token
    // split (it was issued back when a single token never expired) and never
    // got a refresh token of its own - reject it so it falls through to a
    // real re-login instead of being silently grandfathered in forever.
    if (!session || session.expiresAt < new Date() || !session.refreshTokenHash) {
      throw new AppError('Session has been revoked. Please log in again.', 401);
    }
    const lastTouch = lastActiveTouch.get(session.id) || 0;
    if (Date.now() - lastTouch > TOUCH_DEBOUNCE_MS) {
      lastActiveTouch.set(session.id, Date.now());
      session.update({ lastActive: new Date() }).catch(() => {});
    }
  }

  const user = await User.findByPk(payload.sub, {
    include: [
      {
        model: Role,
        as: 'role',
        include: [{ model: Permission, as: 'permissions', include: [{ model: Page, as: 'page' }] }],
      },
    ],
  });

  if (!user || !user.isActive) throw new AppError('Account is not active.', 401);

  req.user = user;
  // session.deviceInfo (set at login - see auth.service.js's createSessionAndToken)
  // is richer than anything derivable from a single request's headers alone:
  // it has the mobile app's self-reported platform/brand/model/appVersion,
  // not just whatever ua-parser-js can guess from a User-Agent string (which
  // is often nothing useful for a native app's HTTP client).
  req.auth = {
    userId: user.id,
    roleId: user.roleId,
    clientType: payload.clientType,
    sessionId: payload.sessionId,
    deviceInfo: session?.deviceInfo || null,
  };
  next();
});

module.exports = { authMiddleware, extractToken };
