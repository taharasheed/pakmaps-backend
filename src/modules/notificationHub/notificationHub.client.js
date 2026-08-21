const env = require('../../config/env');
const logger = require('../../config/logger');
const { upstreamFetch } = require('../proxy/httpClient');

// Short - this only ever runs inline on login/signup, which must never hang
// waiting on a separate service. A timeout here just means the user logs in
// without push registered this time; nothing about auth itself is affected.
const TIMEOUT_MS = 3000;

function isConfigured() {
  return Boolean(env.NOTIFICATION_HUB_URL && env.NOTIFICATION_HUB_API_KEY);
}

// Every exported call is deliberately unthrowable - it catches its own
// errors and resolves to null on any failure (misconfiguration, timeout,
// notification-hub being down, a non-2xx response). Callers never need their
// own try/catch; a notification-hub problem must never fail the pakmaps
// request it's riding along on (login, signup, session eviction).
async function safeCall(path, options, label) {
  if (!isConfigured()) return null;

  try {
    const res = await upstreamFetch(
      `${env.NOTIFICATION_HUB_URL}${path}`,
      {
        ...options,
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': env.NOTIFICATION_HUB_API_KEY, ...options.headers },
      },
      TIMEOUT_MS
    );
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload?.success) {
      logger.warn({ label, status: res.status }, 'notification-hub call did not succeed');
      return null;
    }
    return payload.data;
  } catch (err) {
    logger.warn({ err, label }, 'notification-hub call failed');
    return null;
  }
}

// Idempotent upsert on notification-hub's side (appId + clientDeviceId) -
// safe to call on every login, not just the first one. Returns null (not a
// throw) on any failure - see safeCall.
async function registerDevice({ clientDeviceId, externalUserId, platform }) {
  const data = await safeCall(
    '/v1/devices',
    { method: 'POST', body: JSON.stringify({ clientDeviceId, externalUserId, platform }) },
    'registerDevice'
  );
  return data?.deviceId ? data : null;
}

async function mintConnectToken(deviceId) {
  return safeCall('/v1/devices/' + deviceId + '/connect-token', { method: 'POST' }, 'mintConnectToken');
}

// Bootstraps the long-lived, gateway-rotated credential the on-device daemon
// uses for the multiplexed /device socket - distinct from the short-lived
// JWT connect-token above, which is for a direct (non-daemon) connection.
// Same proxy pattern either way: the daemon/app never talks to
// notification-hub directly, only to this backend.
async function mintSubscriptionCredential(deviceId) {
  return safeCall('/v1/devices/' + deviceId + '/subscription-credential', { method: 'POST' }, 'mintSubscriptionCredential');
}

async function setDeviceActive(deviceId, isActive) {
  return safeCall(
    '/v1/devices/' + deviceId,
    { method: 'PATCH', body: JSON.stringify({ isActive }) },
    'setDeviceActive'
  );
}

// Mints a subscription for the R1 Push raw-WS daemon protocol - the third,
// parallel registration path alongside registerDevice/mintConnectToken
// (direct connections) and registerDevice/mintSubscriptionCredential (the
// original notification-hub-daemon Socket.IO protocol). Same idempotent-
// upsert semantics on notification-hub's side (appId + appInstallationId +
// externalUserId), safe to call again on retry.
async function mintSubscription({ externalUserId, appInstallationId, packageName, applicationSessionId }) {
  const data = await safeCall(
    '/v1/subscription-credentials',
    { method: 'POST', body: JSON.stringify({ externalUserId, appInstallationId, packageName, applicationSessionId }) },
    'mintSubscription'
  );
  return data?.subscriptionId ? data : null;
}

// Fire-and-forget, unthrowable like every other call here - see safeCall.
// notification-hub treats an already-revoked or unknown subscriptionId as a
// successful idempotent outcome on its own side too, so there's nothing
// further for a caller here to branch on.
async function revokeSubscription(subscriptionId) {
  return safeCall('/v1/subscriptions/' + subscriptionId, { method: 'DELETE' }, 'revokeSubscription');
}

module.exports = {
  isConfigured,
  registerDevice,
  mintConnectToken,
  mintSubscriptionCredential,
  setDeviceActive,
  mintSubscription,
  revokeSubscription,
};
