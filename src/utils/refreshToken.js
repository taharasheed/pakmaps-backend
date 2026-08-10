const crypto = require('crypto');
const { constantTimeEqual } = require('./crypto');

const SECRET_BYTES = 40;

// Refresh tokens are opaque, not JWTs - given to the client as
// `${sessionId}.${secret}` so a refresh call can look the session up by
// indexed primary key instead of scanning every session's hash. Only the
// secret's sha256 hash is ever stored. A random 40-byte secret has no
// meaningful brute-force surface, so there's no need for bcrypt's slow/salted
// design - that exists to slow down guessing low-entropy human-chosen
// passwords, not high-entropy random secrets.
function generateRefreshSecret() {
  return crypto.randomBytes(SECRET_BYTES).toString('hex');
}

function hashRefreshSecret(secret) {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

function verifyRefreshSecret(secret, hash) {
  if (!secret || !hash) return false;
  return constantTimeEqual(hashRefreshSecret(secret), hash);
}

function formatRefreshToken(sessionId, secret) {
  return `${sessionId}.${secret}`;
}

function parseRefreshToken(token) {
  if (typeof token !== 'string') return null;
  const separatorIndex = token.indexOf('.');
  if (separatorIndex < 1) return null;
  const sessionId = token.slice(0, separatorIndex);
  const secret = token.slice(separatorIndex + 1);
  if (!secret) return null;
  return { sessionId, secret };
}

module.exports = {
  generateRefreshSecret,
  hashRefreshSecret,
  verifyRefreshSecret,
  formatRefreshToken,
  parseRefreshToken,
};
