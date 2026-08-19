const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const AppError = require('../../utils/AppError');
const { Session } = require('../../db/models');
const notificationHub = require('./notificationHub.client');

// Mints a fresh connect-token for the device already registered against the
// caller's own current session (see auth.service.js's createSessionAndToken)
// - deliberately never accepts a client-supplied deviceId, so there's no way
// to request a token for a device belonging to someone else's session.
//
// Self-healing: if registration never actually succeeded at login (e.g.
// notification-hub was briefly down at that moment), this retries it here
// using the same client-supplied deviceId already stored on the session,
// rather than forcing the user through a full re-login just to recover.
const refreshConnectToken = asyncHandler(async (req, res) => {
  const session = await Session.findByPk(req.auth.sessionId);
  let notificationHubDeviceId = session?.deviceInfo?.notificationHubDeviceId;

  if (!notificationHubDeviceId) {
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
  }

  const token = await notificationHub.mintConnectToken(notificationHubDeviceId);
  if (!token) throw new AppError('Could not reach notification-hub. Try again shortly.', 502);

  return ok(res, token);
});

module.exports = { refreshConnectToken };
