const { ZodError } = require('zod');
const logger = require('../config/logger');
const { fail } = require('../utils/apiResponse');

function notFoundHandler(req, res) {
  return fail(res, `Route not found: ${req.method} ${req.originalUrl}`, 404);
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return fail(res, 'Validation failed.', 422, err.flatten());
  }

  const statusCode = err.statusCode || 500;

  if (statusCode >= 500) {
    logger.error({ err, path: req.originalUrl, method: req.method }, 'Unhandled error');
  }

  return fail(res, err.isOperational ? err.message : 'Internal server error.', statusCode, err.errors || null);
}

module.exports = { errorHandler, notFoundHandler };
