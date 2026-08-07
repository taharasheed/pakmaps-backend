const router = require('express').Router();
const { authMiddleware } = require('../../middleware/auth.middleware');
const { handleMapMatch } = require('./mapMatch.controller');

// Real JWT auth (mobile/web tokens already issued by /api/auth/login) rather
// than the reference implementation's shared bearer-token check - this is
// the production auth system, already built and already used by every other
// route in this backend.
router.post('/map-match', authMiddleware, handleMapMatch);

// Every response from this route must use the map-match envelope
// ({error:{code,retryable}}), not the app-wide {success,message} shape -
// including auth failures from the shared authMiddleware above, which
// throws using the app-wide AppError convention. Caught here, scoped to
// this router, before it would otherwise reach the global error handler.
// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  // Deliberately not req.log - see mapMatch.controller.js for why.
  const logger = require('../../config/logger');
  const statusCode = err.statusCode || 500;

  if (statusCode >= 500) {
    logger.error({ err, path: req.originalUrl }, 'Unhandled error in navigation module');
  }

  const code = statusCode === 401 ? 'UNAUTHORIZED'
    : statusCode === 429 ? 'RATE_LIMITED'
    : statusCode < 500 ? 'INVALID_REQUEST'
    : 'MATCHER_UNAVAILABLE';

  res.set('Cache-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  return res.status(statusCode).type('application/vnd.mapifyit.navigation.v1+json').send(
    JSON.stringify({ error: { code, retryable: statusCode >= 429 } })
  );
});

module.exports = router;
