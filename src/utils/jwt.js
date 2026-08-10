const jwt = require('jsonwebtoken');
const env = require('../config/env');

// Short-lived by design - this is the access token, sent on every request.
// Staying logged in "forever" is handled by the separate, rotating refresh
// token (see utils/refreshToken.js + auth.service.js's rotateSession), not by
// making this one live forever - see the comment on ACCESS_TOKEN_TTL in
// config/env.js for why.
function signToken(payload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.ACCESS_TOKEN_TTL });
}

function verifyToken(token) {
  return jwt.verify(token, env.JWT_SECRET);
}

module.exports = { signToken, verifyToken };
