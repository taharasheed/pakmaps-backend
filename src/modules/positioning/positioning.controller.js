const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const { checkRateLimit } = require('../proxy/rateLimiter');
const { withConcurrencyLimit } = require('../proxy/concurrencyPool');
const service = require('./positioning.service');

// This module does its own DB work in-process (unlike proxy adapters, which
// forward to an upstream) - so unlike everything else using this pool, the
// resource being protected here is the shared Postgres connection pool
// (DB_POOL_MAX=10, shared with every other feature: tiles, notifications,
// dashboards, everything). Positioning is new, unproven, and has no mobile
// caller yet, so it gets a deliberately small slice of that pool - a traffic
// spike or a bug here degrades to fast 503s on these two routes, it cannot
// starve connections from the rest of the app and take the backend down.
// Same withConcurrencyLimit primitive (bounded queue + circuit breaker) the
// buildings tile proxy already relies on for the same kind of protection.
const RESOLVE_CONCURRENCY_LIMIT = 5;
const OBSERVE_CONCURRENCY_LIMIT = 3;

const resolve = asyncHandler(async (req, res) => {
  await checkRateLimit({ identity: `positioning:${req.user.id}`, windowMs: 60000, max: 60 });
  const result = await withConcurrencyLimit('positioning-resolve', RESOLVE_CONCURRENCY_LIMIT, () => service.resolve(req.body));
  return ok(res, result);
});

const observe = asyncHandler(async (req, res) => {
  await checkRateLimit({ identity: `positioning:${req.user.id}`, windowMs: 60000, max: 60 });
  const result = await withConcurrencyLimit('positioning-observe', OBSERVE_CONCURRENCY_LIMIT, () => service.observe(req.body));
  return ok(res, result, 'Observation recorded.');
});

module.exports = { resolve, observe };
