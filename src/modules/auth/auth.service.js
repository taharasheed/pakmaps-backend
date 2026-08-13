const bcrypt = require('bcrypt');
const { User, Role, Permission, Page, Session } = require('../../db/models');
const AppError = require('../../utils/AppError');
const env = require('../../config/env');
const { signToken } = require('../../utils/jwt');
const {
  generateRefreshSecret,
  hashRefreshSecret,
  verifyRefreshSecret,
  formatRefreshToken,
  parseRefreshToken,
} = require('../../utils/refreshToken');
const { getClientIp, getDeviceInfo, getClientLocation } = require('../../utils/requestMeta');

// Sliding window for the refresh token - reset to "now + this" on every
// successful rotateSession() call, so anyone using the app at all within the
// window never sees a login screen. See ACCESS_TOKEN_TTL's comment in
// config/env.js for why this is a separate, long-lived token rather than
// just making the access token itself never expire.
const REFRESH_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * env.REFRESH_TOKEN_TTL_DAYS;

const roleIncludeWithPermissions = {
  model: Role,
  as: 'role',
  include: [{ model: Permission, as: 'permissions', include: [{ model: Page, as: 'page' }] }],
};

async function findUserWithRole(email) {
  return User.scope('withPassword').findOne({ where: { email }, include: [roleIncludeWithPermissions] });
}

async function authenticateCredentials(email, password, clientType) {
  const user = await findUserWithRole(email);
  if (!user) throw new AppError('Invalid email or password.', 401);
  if (!user.isActive) throw new AppError('This account has been disabled.', 403);

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new AppError('Invalid email or password.', 401);

  if (clientType === 'mobile' && !user.role.canAccessMobileApp) {
    throw new AppError('This account does not have mobile app access.', 403);
  }

  return user;
}

async function registerMobileUser({ name, email, phone, gender, password }) {
  const existingEmail = await User.findOne({ where: { email } });
  if (existingEmail) throw new AppError('An account with this email already exists.', 409);

  const existingPhone = await User.findOne({ where: { phone } });
  if (existingPhone) throw new AppError('An account with this phone number already exists.', 409);

  const role = await Role.findOne({ where: { name: 'Mobile User' } });
  if (!role) throw new AppError('Sign up is not available right now.', 500);

  const passwordHash = await bcrypt.hash(password, env.BCRYPT_SALT_ROUNDS);
  await User.create({ name, email, phone, gender, passwordHash, roleId: role.id });

  return findUserWithRole(email);
}

// deviceMeta is whatever the client optionally sent (deviceId/platform/model/
// brand/appVersion) - merged alongside the User-Agent-derived browser/os info
// rather than replacing it, since one comes from the client and one from the
// request itself.
async function createSessionAndToken(user, clientType, req, deviceMeta = {}) {
  // Mobile is single-session by design: signing in on a new device should log
  // the previous one out. Deleting the old session row (rather than just
  // overwriting its refresh token) means the old device's still-valid access
  // token is rejected on its very next request too, via the session lookup in
  // auth.middleware.js - not just once its refresh token would eventually
  // expire. Web (admin panel) is untouched - staff routinely have the panel
  // open on more than one machine/tab at once.
  if (clientType === 'mobile') {
    await Session.destroy({ where: { userId: user.id, clientType: 'mobile' } });
  }

  const { lat, lon } = getClientLocation(req);
  const refreshSecret = generateRefreshSecret();

  const session = await Session.create({
    userId: user.id,
    clientType,
    deviceInfo: { ...getDeviceInfo(req), ...deviceMeta },
    ipAddress: getClientIp(req),
    lat,
    lon,
    lastActive: new Date(),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    refreshTokenHash: hashRefreshSecret(refreshSecret),
  });

  const accessToken = signToken({ sub: user.id, roleId: user.roleId, clientType, sessionId: session.id });
  const refreshToken = formatRefreshToken(session.id, refreshSecret);

  return { session, accessToken, refreshToken };
}

// Verifies a presented refresh token and, if valid, rotates it: a new access
// token AND a new refresh token are issued, and the session's stored hash is
// overwritten so the old refresh token stops matching immediately. If the
// presented token's secret doesn't match what's currently stored for that
// session, it's a token from before the last rotation being replayed - a
// signal of theft, not just staleness - so the session is deleted outright
// rather than merely rejected.
async function rotateSession(rawRefreshToken, req) {
  const parsed = parseRefreshToken(rawRefreshToken);
  if (!parsed) throw new AppError('Invalid refresh token.', 401);

  const session = await Session.findByPk(parsed.sessionId, { include: [{ model: User, as: 'user' }] });
  if (!session || !session.refreshTokenHash) {
    throw new AppError('Session not found. Please sign in again.', 401);
  }

  if (!verifyRefreshSecret(parsed.secret, session.refreshTokenHash)) {
    await session.destroy();
    throw new AppError('This session was revoked. Please sign in again.', 401);
  }

  if (session.expiresAt < new Date()) {
    await session.destroy();
    throw new AppError('Session expired. Please sign in again.', 401);
  }

  if (!session.user || !session.user.isActive) {
    await session.destroy();
    throw new AppError('This account has been disabled.', 403);
  }

  const refreshSecret = generateRefreshSecret();
  const { lat, lon } = getClientLocation(req);

  await session.update({
    refreshTokenHash: hashRefreshSecret(refreshSecret),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    lastActive: new Date(),
    ...(lat !== null && lon !== null ? { lat, lon } : {}),
  });

  const accessToken = signToken({
    sub: session.user.id,
    roleId: session.user.roleId,
    clientType: session.clientType,
    sessionId: session.id,
  });
  const refreshToken = formatRefreshToken(session.id, refreshSecret);

  return { session, user: session.user, accessToken, refreshToken };
}

function serializeUser(user) {
  const plain = user.toJSON ? user.toJSON() : user;
  const permissions = (plain.role?.permissions || []).map((p) => ({ page: p.page?.key, action: p.action }));
  return {
    id: plain.id,
    name: plain.name,
    email: plain.email,
    phone: plain.phone,
    gender: plain.gender,
    isActive: plain.isActive,
    lastLoginAt: plain.lastLoginAt,
    role: plain.role
      ? {
          id: plain.role.id,
          name: plain.role.name,
          canAccessMobileApp: plain.role.canAccessMobileApp,
        }
      : null,
    permissions,
  };
}

module.exports = {
  findUserWithRole,
  authenticateCredentials,
  registerMobileUser,
  createSessionAndToken,
  rotateSession,
  serializeUser,
  roleIncludeWithPermissions,
};
