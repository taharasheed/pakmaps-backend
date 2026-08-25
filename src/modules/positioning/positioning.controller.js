const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const { checkRateLimit } = require('../proxy/rateLimiter');
const { withConcurrencyLimit } = require('../proxy/concurrencyPool');
const AppError = require('../../utils/AppError');
const env = require('../../config/env');
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
// Weakest-priority path of the three - lowest concurrency slice.
const TRAJECTORY_CONCURRENCY_LIMIT = 2;

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

const recordTrajectory = asyncHandler(async (req, res) => {
  // Off by default (POSITIONING_PDR_TRAJECTORIES_ENABLED) - the client
  // itself only sends this on ENABLE_INDOOR_PDR R1 builds, but the backend
  // gate exists so rollout can be staged (internal QA first, then a
  // consented cohort) independently of what any given client build does.
  if (env.POSITIONING_PDR_TRAJECTORIES_ENABLED !== 'true') {
    throw new AppError('Not found.', 404);
  }
  // Keyed per installation, not per user - this is specifically about
  // capping how fast one device can push trajectory points, independent of
  // how many devices one account happens to be rate-limited under via the
  // shared per-user counter above.
  await checkRateLimit({ identity: `positioning-trajectory:${req.body.installation_id}`, windowMs: 5000, max: 2 });
  const result = await withConcurrencyLimit('positioning-trajectory', TRAJECTORY_CONCURRENCY_LIMIT, () => service.recordTrajectory(req.body));
  return ok(res, result, 'Trajectory point recorded.');
});

module.exports = { resolve, observe, recordTrajectory };
