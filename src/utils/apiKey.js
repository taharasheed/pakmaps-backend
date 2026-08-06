const crypto = require('crypto');

const PREFIX_HEX_LENGTH = 12;
const SECRET_HEX_LENGTH = 48;
const KEY_PATTERN = /^nmk_([0-9a-f]{12})\.([0-9a-f]{48})$/;

// API keys are high-entropy machine secrets, not human-chosen passwords, so a
// fast constant-time hash (SHA-256) is the right tool here - bcrypt's
// intentional slowness exists to resist brute-forcing low-entropy input, which
// doesn't apply to a 48-hex-char random secret, and would only hurt latency on
// every request an integrated app makes.
function generateApiKey() {
  const keyPrefix = crypto.randomBytes(PREFIX_HEX_LENGTH / 2).toString('hex');
  const secret = crypto.randomBytes(SECRET_HEX_LENGTH / 2).toString('hex');
  const rawKey = `nmk_${keyPrefix}.${secret}`;
  return { rawKey, keyPrefix, keyHash: hashApiKey(rawKey) };
}

function hashApiKey(rawKey) {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

function extractPrefix(rawKey) {
  const match = KEY_PATTERN.exec(rawKey || '');
  return match ? match[1] : null;
}

function verifyApiKey(rawKey, keyHash) {
  if (!KEY_PATTERN.test(rawKey || '')) return false;
  const candidate = Buffer.from(hashApiKey(rawKey), 'hex');
  const expected = Buffer.from(keyHash, 'hex');
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

module.exports = { generateApiKey, hashApiKey, extractPrefix, verifyApiKey };
