const test = require('node:test');
const assert = require('node:assert/strict');

const { constantTimeEqual } = require('../src/utils/crypto');
const {
  generateRefreshSecret,
  hashRefreshSecret,
  verifyRefreshSecret,
  formatRefreshToken,
  parseRefreshToken,
} = require('../src/utils/refreshToken');
const { signToken, verifyToken } = require('../src/utils/jwt');

test('constantTimeEqual matches equal strings and rejects mismatches', () => {
  assert.equal(constantTimeEqual('abc123', 'abc123'), true);
  assert.equal(constantTimeEqual('abc123', 'abc124'), false);
  assert.equal(constantTimeEqual('abc123', 'abc12'), false);
  assert.equal(constantTimeEqual('', ''), true);
});

test('generateRefreshSecret produces unique, high-entropy secrets', () => {
  const a = generateRefreshSecret();
  const b = generateRefreshSecret();
  assert.notEqual(a, b);
  assert.equal(a.length, 80); // 40 bytes as hex
});

test('formatRefreshToken/parseRefreshToken round-trip', () => {
  const sessionId = '9cc68619-0472-0783-aa72-7bebd1d1947e';
  const secret = generateRefreshSecret();
  const token = formatRefreshToken(sessionId, secret);
  const parsed = parseRefreshToken(token);
  assert.deepEqual(parsed, { sessionId, secret });
});

test('parseRefreshToken rejects malformed tokens', () => {
  assert.equal(parseRefreshToken('no-separator-here'), null);
  assert.equal(parseRefreshToken('session-id-with-no-secret.'), null);
  assert.equal(parseRefreshToken(''), null);
  assert.equal(parseRefreshToken(undefined), null);
  assert.equal(parseRefreshToken(null), null);
  assert.equal(parseRefreshToken(12345), null);
});

test('verifyRefreshSecret accepts the correct secret and rejects everything else', () => {
  const secret = generateRefreshSecret();
  const hash = hashRefreshSecret(secret);

  assert.equal(verifyRefreshSecret(secret, hash), true);
  // A refresh token from before the last rotation must never verify again -
  // this is the theft-detection property the whole rotation scheme relies on.
  assert.equal(verifyRefreshSecret(generateRefreshSecret(), hash), false);
  assert.equal(verifyRefreshSecret('', hash), false);
  assert.equal(verifyRefreshSecret(secret, ''), false);
  assert.equal(verifyRefreshSecret(null, hash), false);
});

test('hashRefreshSecret is deterministic (same input, same hash)', () => {
  const secret = generateRefreshSecret();
  assert.equal(hashRefreshSecret(secret), hashRefreshSecret(secret));
});

test('signToken issues a short-lived access token (has an exp claim)', () => {
  const token = signToken({ sub: 'user-1', roleId: 'role-1', clientType: 'mobile', sessionId: 'session-1' });
  const decoded = verifyToken(token);
  assert.equal(typeof decoded.exp, 'number');
  assert.equal(decoded.sub, 'user-1');
});

test('verifyToken rejects an expired access token', () => {
  // signToken always uses env.ACCESS_TOKEN_TTL, so build an already-expired
  // token directly with jsonwebtoken to exercise the expiry check itself.
  const jwt = require('jsonwebtoken');
  const env = require('../src/config/env');
  const expired = jwt.sign({ sub: 'user-1' }, env.JWT_SECRET, { expiresIn: '-1s' });
  assert.throws(() => verifyToken(expired));
});
