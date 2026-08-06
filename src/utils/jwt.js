const jwt = require('jsonwebtoken');
const env = require('../config/env');

function signToken(payload, clientType) {
  const expiresIn = clientType === 'mobile' ? env.JWT_EXPIRES_IN_MOBILE : env.JWT_EXPIRES_IN_WEB;
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn });
}

function verifyToken(token) {
  return jwt.verify(token, env.JWT_SECRET);
}

module.exports = { signToken, verifyToken };
