const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const AppError = require('../../utils/AppError');
const env = require('../../config/env');
const { Session } = require('../../db/models');
const notificationHub = require('./notificationHub.client');

// Shared by refreshConnectToken and mintSubscriptionCredential below - both
// need the caller's session to have a notificationHubDeviceId before they
// can mint anything, and both self-heal the same way: if registration never
// actually succeeded at login (e.g. notification-hub was briefly down at
// that moment), retry it here using the deviceId the client already sent,
// rather than forcing a full re-login just to recover.
async function ensureNotificationHubDeviceId(req) {
  const session = await Session.findByPk(req.auth.sessionId);
  let notificationHubDeviceId = session?.deviceInfo?.notificationHubDeviceId;
  if (notificationHubDeviceId) return notificationHubDeviceId;

  const clientDeviceId = session?.deviceInfo?.deviceId;
  if (!clientDeviceId) throw new AppError('No device info on this session. Please sign in again.', 404);

  const registered = await notificationHub.registerDevice({
    clientDeviceId,
    externalUserId: req.user.id,
    platform: session.deviceInfo?.platform,
  });
  if (!registered) throw new AppError('Could not reach notification-hub. Try again shortly.', 502);

  notificationHubDeviceId = registered.deviceId;
  await session.update({ deviceInfo: { ...session.deviceInfo, notificationHubDeviceId } });
  return notificationHubDeviceId;
}

// Mints a fresh connect-token for the device already registered against the
// caller's own current session - deliberately never accepts a
// client-supplied deviceId, so there's no way to request a token for a
// device belonging to someone else's session. This is the direct
// (non-daemon) connection credential.
const refreshConnectToken = asyncHandler(async (req, res) => {
  const notificationHubDeviceId = await ensureNotificationHubDeviceId(req);

  const token = await notificationHub.mintConnectToken(notificationHubDeviceId);
  if (!token) throw new AppError('Could not reach notification-hub. Try again shortly.', 502);

  return ok(res, token);
});

// Mints the long-lived, gateway-rotated credential the on-device daemon uses
// for the multiplexed /device socket - the daemon bootstrap counterpart to
// refreshConnectToken above. Same self-healing/no-client-supplied-deviceId
// guarantees.
const issueSubscriptionCredential = asyncHandler(async (req, res) => {
  const notificationHubDeviceId = await ensureNotificationHubDeviceId(req);

  const credential = await notificationHub.mintSubscriptionCredential(notificationHubDeviceId);
  if (!credential) throw new AppError('Could not reach notification-hub. Try again shortly.', 502);

  return ok(res, credential);
});

// The R1 Push protected credential retry endpoint
// (PAKMAPS_R1_PUSH_BACKEND_IMPLEMENTATION_GUIDE.md's "Credential retry
// endpoint") - supports a successful login when the gateway was temporarily
// unavailable at that moment (see auth.service.js's createSessionAndToken,
// which returns r1Push: null rather than blocking login on that failure).
// Never accepts a client-supplied deviceId/appInstallationId/user - it only
// ever re-derives everything from the caller's own current session, exactly
// like refreshConnectToken/issueSubscriptionCredential above. Requires the
// R1 build gate for the same reason login does: this backend deployment
// must have been configured for it, not just any caller asking. No bespoke
// rate limiter here - this repo's only rate-limiting infra today is scoped
// to the anonymous proxy/tile surface (modules/proxy/rateLimiter.js); this
// endpoint is already behind authMiddleware (no anonymous access) and
// idempotent (subscriptions.service.js upserts, so spamming it creates no
// extra state), a materially smaller abuse surface than what that limiter
// defends against.
const issueR1PushCredential = asyncHandler(async (req, res) => {
  if (env.PUSH_NOTIFICATION_PROVIDER !== 'custom') {
    throw new AppError('R1 Push is not enabled for this deployment.', 404);
  }

  const session = await Session.findByPk(req.auth.sessionId);
  const appInstallationId = session?.deviceInfo?.appInstallationId;
  if (!appInstallationId) throw new AppError('No R1 Push installation info on this session. Please sign in again.', 404);

  const subscription = await notificationHub.mintSubscription({
    externalUserId: req.user.id,
    appInstallationId,
    packageName: session.deviceInfo?.packageName,
  });
  if (!subscription) throw new AppError('Could not reach notification-hub. Try again shortly.', 502);

  if (session.deviceInfo?.notificationHubSubscriptionId !== subscription.subscriptionId) {
    await session.update({ deviceInfo: { ...session.deviceInfo, notificationHubSubscriptionId: subscription.subscriptionId } });
  }

  return ok(res, subscription);
});

module.exports = { refreshConnectToken, issueSubscriptionCredential, issueR1PushCredential };
