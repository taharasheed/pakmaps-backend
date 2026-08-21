const crypto = require('crypto');
const env = require('../config/env');

const MAC_RE = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/;
const TOKEN_KEY_VERSION = 1;

function normalizeBssid(raw) {
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim().toLowerCase();
  if (!MAC_RE.test(normalized)) return null;
  return normalized;
}

// Locally administered addresses (bit 1 of the first octet set) are assigned
// by the OS at runtime, not burned into hardware - Android randomizes a
// phone's own client MAC this way, and plenty of routers do the same for
// guest/hotspot SSIDs. Either way, the address doesn't identify a fixed
// physical location and would corrupt the radio map if learned.
function isLocallyAdministered(normalizedBssid) {
  const firstOctet = parseInt(normalizedBssid.slice(0, 2), 16);
  return (firstOctet & 0x02) !== 0;
}

function isBroadcastOrMulticast(normalizedBssid) {
  if (normalizedBssid === 'ff:ff:ff:ff:ff:ff') return true;
  const firstOctet = parseInt(normalizedBssid.slice(0, 2), 16);
  return (firstOctet & 0x01) !== 0;
}

// Never store the raw BSSID - only this token. Rotate POSITIONING_BSSID_PEPPER
// and bump TOKEN_KEY_VERSION together if the pepper ever needs to change.
function tokenizeBssid(normalizedBssid) {
  const hmac = crypto.createHmac('sha256', env.POSITIONING_BSSID_PEPPER);
  hmac.update(normalizedBssid);
  return { token: hmac.digest('hex'), tokenKeyVersion: TOKEN_KEY_VERSION };
}

module.exports = { normalizeBssid, isLocallyAdministered, isBroadcastOrMulticast, tokenizeBssid, TOKEN_KEY_VERSION };
