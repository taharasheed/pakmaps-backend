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
const notificationHub = require('../notificationHub/notificationHub.client');

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

// Disables (never deletes) each session's notification-hub registration(s),
// if it has any - shared by the new-login eviction path below and by every
// place a session is destroyed directly (logout, revokeSession,
// revokeOtherSessions; see auth.controller.js), and by users.controller.js's
// account disable/delete paths. A session's deviceInfo may carry a
// notificationHubDeviceId (direct/legacy or notification-hub-daemon path)
// and/or a notificationHubSubscriptionId (R1 Push raw-WS path) - never both
// for the same session in practice (see createSessionAndToken), but both are
// checked so this stays correct regardless. A web session's deviceInfo never
// has either set, so calling this on one is a no-op, not a special case
// callers need to branch around. Both notificationHub calls are
// unthrowable, so a notification-hub outage here can't fail the caller's own
// destroy/logout flow.
//
// The Device path (setDeviceActive false) is always safe to call here -
// upsertDevice on notification-hub's side always resets isActive:true on the
// device's next real login, so it's never a one-way trap. The Subscription
// path (revokeSubscription) is NOT safe to call unconditionally:
// subscriptions.service.js's createSubscription deliberately refuses to
// resurrect a revoked subscription for the same (appId, appInstallationId,
// externalUserId) - by design, a genuine reinstall (fresh appInstallationId)
// is the only way back. A phone's appInstallationId never changes across an
// ordinary logout/login, so revoking here permanently locks that phone out
// of R1 Push the moment it logs back in - discovered 2026-08-25 when a real
// tester's relogin started permanently 502ing on the credential endpoint.
// revokeSubscriptions therefore defaults to true (this account is genuinely
// losing this device's access: evicted by a new-device login, an explicit
// revokeSession/revokeOtherSessions, or an account disable/delete) and is
// passed false only from the plain self-logout path, where the same device
// logging back in moments later is the expected, common case, not a device
// actually losing access.
async function disableNotificationHubDevices(sessions, { revokeSubscriptions = true } = {}) {
  await Promise.all([
    ...sessions
      .map((s) => s.deviceInfo?.notificationHubDeviceId)
      .filter(Boolean)
      .map((deviceId) => notificationHub.setDeviceActive(deviceId, false)),
    ...(revokeSubscriptions
      ? sessions
          .map((s) => s.deviceInfo?.notificationHubSubscriptionId)
          .filter(Boolean)
          .map((subscriptionId) => notificationHub.revokeSubscription(subscriptionId))
      : []),
  ]);
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
    const evictedSessions = await Session.findAll({
      where: { userId: user.id, clientType: 'mobile' },
      attributes: ['id', 'deviceInfo'],
    });
    await Session.destroy({ where: { userId: user.id, clientType: 'mobile' } });
    await disableNotificationHubDevices(evictedSessions);
  }

  // R1 Push build gate (PAKMAPS_R1_PUSH_BACKEND_IMPLEMENTATION_GUIDE.md's
  // "Scope and rollout"): both this deployment's own build config AND the
  // client's own request must agree it's a custom-push build before any R1
  // credential is minted - neither one alone is trusted. When gated on, the
  // R1 subscription path REPLACES the legacy Device/connect-token
  // registration below entirely for this session, per the guide's explicit
  // instruction to stop minting the old connect-token for R1 builds rather
  // than just withholding it from the response.
  const isR1PushBuild = env.PUSH_NOTIFICATION_PROVIDER === 'custom' && deviceMeta.pushProvider === 'custom';

  let notificationHubInfo = null;
  let r1PushInfo = null;

  if (clientType === 'mobile' && isR1PushBuild && deviceMeta.appInstallationId) {
    const subscription = await notificationHub.mintSubscription({
      externalUserId: user.id,
      appInstallationId: deviceMeta.appInstallationId,
      packageName: deviceMeta.packageName,
    });
    if (subscription) {
      r1PushInfo = {
        appId: subscription.appId,
        subscriptionId: subscription.subscriptionId,
        credential: subscription.credential,
        expiresAt: subscription.expiresAt,
      };
    }
  } else if (clientType === 'mobile' && deviceMeta.deviceId) {
    // Registers this device with notification-hub and mints its first
    // connect-token inline, using data the client already sent at
    // login/signup (see deviceMetaSchema) - no separate API call needed on
    // the client's part for the common "log in, then connect" case.
    // Silently skipped for web, or for any mobile client not yet sending a
    // deviceId (older builds).
    const registered = await notificationHub.registerDevice({
      clientDeviceId: deviceMeta.deviceId,
      externalUserId: user.id,
      platform: deviceMeta.platform,
    });
    if (registered) {
      const token = await notificationHub.mintConnectToken(registered.deviceId);
      notificationHubInfo = { deviceId: registered.deviceId, connectToken: token?.connectToken || null, expiresAt: token?.expiresAt || null };
    }
  }

  const { lat, lon } = getClientLocation(req);
  const refreshSecret = generateRefreshSecret();

  const session = await Session.create({
    userId: user.id,
    clientType,
    deviceInfo: {
      ...getDeviceInfo(req),
      ...deviceMeta,
      ...(notificationHubInfo ? { notificationHubDeviceId: notificationHubInfo.deviceId } : {}),
      ...(r1PushInfo ? { notificationHubSubscriptionId: r1PushInfo.subscriptionId } : {}),
    },
    ipAddress: getClientIp(req),
    lat,
    lon,
    lastActive: new Date(),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    refreshTokenHash: hashRefreshSecret(refreshSecret),
  });

  const accessToken = signToken({ sub: user.id, roleId: user.roleId, clientType, sessionId: session.id });
  const refreshToken = formatRefreshToken(session.id, refreshSecret);

  return { session, accessToken, refreshToken, notificationHub: notificationHubInfo, r1Push: r1PushInfo };
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
  disableNotificationHubDevices,
};
