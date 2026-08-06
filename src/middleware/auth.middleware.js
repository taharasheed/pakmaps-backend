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

  if (payload.sessionId) {
    const session = await Session.findByPk(payload.sessionId);
    if (!session || session.expiresAt < new Date()) {
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
  req.auth = { userId: user.id, roleId: user.roleId, clientType: payload.clientType, sessionId: payload.sessionId };
  next();
});

module.exports = { authMiddleware, extractToken };
