const { redis } = require('../../config/redis');
const env = require('../../config/env');
const AppError = require('../../utils/AppError');

async function incrementWindowCounter(key, windowMs) {
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.pexpire(key, windowMs);
  }
  return count;
}

// Two independent fixed-window counters per call, both keyed per user
// (falls back to IP): one scoped to the specific service (slug), one
// aggregating every service combined. Callers that don't pass a slug (e.g.
// map-match, which already builds its own namespaced identity) get only the
// single un-scoped counter, unchanged from before.
//
// The per-service counter is what api_services.rate_limit_override tunes -
// it used to be the *only* counter, sharing one Redis key across every
// service for a user. That meant a service with a high override (tiles,
// 600/min) implicitly raised the effective ceiling for a user's combined
// traffic across all services, since a mixed burst wasn't capped until it
// hit whichever override was highest - and conversely, heavy legitimate use
// of one service could exhaust the shared count and reject calls to an
// unrelated service that hadn't itself been called much. Splitting the
// counters fixes both: each service is judged only by its own traffic, and
// RATE_LIMIT_GLOBAL_MAX_REQUESTS is the one number actually preventing a
// user from multiplying total throughput by spreading calls across services.
async function checkRateLimit({
  identity,
  slug,
  windowMs = env.RATE_LIMIT_WINDOW_MS,
  max = env.RATE_LIMIT_MAX_REQUESTS,
  globalMax = env.RATE_LIMIT_GLOBAL_MAX_REQUESTS,
}) {
  const window = Math.floor(Date.now() / windowMs);
  const serviceKey = slug ? `ratelimit:${identity}:${slug}:${window}` : `ratelimit:${identity}:${window}`;

  const count = await incrementWindowCounter(serviceKey, windowMs);
  if (count > max) {
    throw new AppError('Rate limit exceeded. Please slow down and try again shortly.', 429);
  }

  if (!slug) {
    return { count, remaining: Math.max(0, max - count), limit: max };
  }

  const globalKey = `ratelimit:global:${identity}:${window}`;
  const globalCount = await incrementWindowCounter(globalKey, windowMs);
  if (globalCount > globalMax) {
    throw new AppError('Rate limit exceeded across all services. Please slow down and try again shortly.', 429);
  }

  return {
    count,
    remaining: Math.max(0, max - count),
    limit: max,
    globalCount,
    globalRemaining: Math.max(0, globalMax - globalCount),
    globalLimit: globalMax,
  };
}

module.exports = { checkRateLimit };
