const { redis } = require('../../config/redis');
const env = require('../../config/env');
const AppError = require('../../utils/AppError');

// Fixed-window counter, keyed per user (falls back to IP), same global limit for
// everyone - there are no per-client tiers/plans in this system. A per-service
// override (api_services.rate_limit_override) can tighten the limit for a
// specific expensive upstream (e.g. routing) without touching the global default.
async function checkRateLimit({ identity, windowMs = env.RATE_LIMIT_WINDOW_MS, max = env.RATE_LIMIT_MAX_REQUESTS }) {
  const window = Math.floor(Date.now() / windowMs);
  const key = `ratelimit:${identity}:${window}`;

  const count = await redis.incr(key);
  if (count === 1) {
    await redis.pexpire(key, windowMs);
  }

  if (count > max) {
    throw new AppError('Rate limit exceeded. Please slow down and try again shortly.', 429);
  }

  return { count, remaining: Math.max(0, max - count), limit: max };
}

module.exports = { checkRateLimit };
