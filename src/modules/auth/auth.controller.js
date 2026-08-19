const bcrypt = require('bcrypt');
const { Op } = require('sequelize');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/apiResponse');
const AppError = require('../../utils/AppError');
const env = require('../../config/env');
const { Session } = require('../../db/models');
const { recordAudit } = require('../audit/audit.service');
const {
  authenticateCredentials,
  registerMobileUser,
  createSessionAndToken,
  rotateSession,
  serializeUser,
  findUserWithRole,
} = require('./auth.service');

// The refresh token gets its own cookie, scoped to only the one route that
// ever reads it - the browser then never sends it on ordinary API calls,
// which is the actual point of splitting it out from the access token (see
// ACCESS_TOKEN_TTL's comment in config/env.js).
const REFRESH_COOKIE_NAME = `${env.COOKIE_NAME}_rt`;
const REFRESH_COOKIE_PATH = '/api/auth/refresh';
// Soft/approximate match for the access token's lifetime - not the real
// enforcement (the JWT's own exp claim is), just tidiness so the browser
// doesn't hold onto a dead cookie longer than it has to.
const ACCESS_COOKIE_MAX_AGE_MS = 1000 * 60 * 15;
const REFRESH_COOKIE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * env.REFRESH_TOKEN_TTL_DAYS;

function baseCookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
  };
}

function accessCookieOptions() {
  return { ...baseCookieOptions(), maxAge: ACCESS_COOKIE_MAX_AGE_MS };
}

function refreshCookieOptions() {
  return { ...baseCookieOptions(), path: REFRESH_COOKIE_PATH, maxAge: REFRESH_COOKIE_MAX_AGE_MS };
}

function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie(env.COOKIE_NAME, accessToken, accessCookieOptions());
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
}

function clearAuthCookies(res) {
  res.clearCookie(env.COOKIE_NAME);
  res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
}

// Web gets tokens purely via httpOnly cookies - handing the raw refresh
// token back in a JS-readable response body would defeat the point of
// httpOnly. Mobile has no cookie jar, so it gets both tokens in the body and
// is responsible for storing them itself (see the integration guide).
function tokenResponseData(clientType, user, accessToken, refreshToken, notificationHub) {
  const data = { user: serializeUser(user) };
  if (clientType === 'mobile') {
    data.accessToken = accessToken;
    data.refreshToken = refreshToken;
    // Null whenever notification-hub isn't configured, was unreachable, or
    // this client didn't send a deviceId yet - never block on it, the client
    // just falls back to minting its own connect-token later.
    data.notificationHub = notificationHub;
  }
  return data;
}

function pickDeviceMeta(body) {
  const { deviceId, platform, model, brand, appVersion } = body;
  return { deviceId, platform, model, brand, appVersion };
}

const signup = asyncHandler(async (req, res) => {
  const { name, email, phone, gender, password } = req.body;
  const user = await registerMobileUser({ name, email, phone, gender, password });
  const { session, accessToken, refreshToken, notificationHub } = await createSessionAndToken(
    user,
    'mobile',
    req,
    pickDeviceMeta(req.body)
  );

  await recordAudit({ req, user, action: 'signup', entityType: 'session', entityId: session.id, source: 'mobile' });

  return created(res, tokenResponseData('mobile', user, accessToken, refreshToken, notificationHub), 'Account created.');
});

const login = asyncHandler(async (req, res) => {
  const { email, password, clientType } = req.body;
  const user = await authenticateCredentials(email, password, clientType);
  const { session, accessToken, refreshToken, notificationHub } = await createSessionAndToken(
    user,
    clientType,
    req,
    pickDeviceMeta(req.body)
  );

  await user.update({ lastLoginAt: new Date() });
  await recordAudit({ req, user, action: 'login', entityType: 'session', entityId: session.id, source: clientType });

  if (clientType === 'web') {
    setAuthCookies(res, accessToken, refreshToken);
  }

  return ok(res, tokenResponseData(clientType, user, accessToken, refreshToken, notificationHub), 'Logged in successfully.');
});

// Public - the access token is presumably already expired, that's the whole
// reason this is being called. Web reads the path-scoped refresh cookie;
// mobile sends the refresh token in the body.
const refresh = asyncHandler(async (req, res) => {
  const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
  if (!rawRefreshToken) throw new AppError('Refresh token is required.', 401);

  const { session, user, accessToken, refreshToken } = await rotateSession(rawRefreshToken, req);

  if (session.clientType === 'web') {
    setAuthCookies(res, accessToken, refreshToken);
    return ok(res, null, 'Session refreshed.');
  }

  return ok(res, { accessToken, refreshToken }, 'Session refreshed.');
});

const logout = asyncHandler(async (req, res) => {
  if (req.auth?.sessionId) {
    await Session.destroy({ where: { id: req.auth.sessionId } });
  }
  await recordAudit({ req, user: req.user, action: 'logout', entityType: 'session', entityId: req.auth?.sessionId });
  clearAuthCookies(res);
  return ok(res, null, 'Logged out.');
});

const me = asyncHandler(async (req, res) => {
  return ok(res, serializeUser(req.user));
});

const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await findUserWithRole(req.user.email);

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new AppError('Current password is incorrect.', 400);

  const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_SALT_ROUNDS);
  await user.update({ passwordHash });

  await recordAudit({ req, user: req.user, action: 'change_password', entityType: 'user', entityId: user.id });

  return ok(res, null, 'Password changed successfully.');
});

const listSessions = asyncHandler(async (req, res) => {
  const { page, pageSize } = req.query;
  const { rows, count } = await Session.findAndCountAll({
    where: { userId: req.user.id },
    order: [['lastActive', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  const data = rows.map((s) => ({ ...s.toJSON(), isCurrent: s.id === req.auth.sessionId }));
  return ok(res, { rows: data, page, pageSize, total: count, totalPages: Math.ceil(count / pageSize) });
});

const revokeSession = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await Session.destroy({ where: { id, userId: req.user.id } });
  await recordAudit({ req, user: req.user, action: 'revoke_session', entityType: 'session', entityId: id });
  return ok(res, null, 'Session revoked.');
});

const revokeOtherSessions = asyncHandler(async (req, res) => {
  await Session.destroy({
    where: { userId: req.user.id, id: { [Op.ne]: req.auth.sessionId } },
  });
  await recordAudit({ req, user: req.user, action: 'revoke_other_sessions', entityType: 'user', entityId: req.user.id });
  return ok(res, null, 'All other sessions logged out.');
});

module.exports = { signup, login, refresh, logout, me, changePassword, listSessions, revokeSession, revokeOtherSessions };
