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
  serializeUser,
  findUserWithRole,
} = require('./auth.service');

function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7,
  };
}

function pickDeviceMeta(body) {
  const { deviceId, platform, model, brand, appVersion } = body;
  return { deviceId, platform, model, brand, appVersion };
}

const signup = asyncHandler(async (req, res) => {
  const { name, email, phone, gender, password } = req.body;
  const user = await registerMobileUser({ name, email, phone, gender, password });
  const { session, token } = await createSessionAndToken(user, 'mobile', req, pickDeviceMeta(req.body));

  await recordAudit({ req, user, action: 'signup', entityType: 'session', entityId: session.id, source: 'mobile' });

  return created(res, { token, user: serializeUser(user) }, 'Account created.');
});

const login = asyncHandler(async (req, res) => {
  const { email, password, clientType } = req.body;
  const user = await authenticateCredentials(email, password, clientType);
  const { session, token } = await createSessionAndToken(user, clientType, req, pickDeviceMeta(req.body));

  await user.update({ lastLoginAt: new Date() });
  await recordAudit({ req, user, action: 'login', entityType: 'session', entityId: session.id, source: clientType });

  if (clientType === 'web') {
    res.cookie(env.COOKIE_NAME, token, cookieOptions());
  }

  return ok(res, { token, user: serializeUser(user) }, 'Logged in successfully.');
});

const logout = asyncHandler(async (req, res) => {
  if (req.auth?.sessionId) {
    await Session.destroy({ where: { id: req.auth.sessionId } });
  }
  await recordAudit({ req, user: req.user, action: 'logout', entityType: 'session', entityId: req.auth?.sessionId });
  res.clearCookie(env.COOKIE_NAME);
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

module.exports = { signup, login, logout, me, changePassword, listSessions, revokeSession, revokeOtherSessions };
