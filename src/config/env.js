require('dotenv').config();
const { z } = require('zod');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  LOG_LEVEL: z.string().default('info'),

  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_POOL_MIN: z.coerce.number().int().nonnegative().default(2),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),

  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  // Short-lived on purpose: this is the token sent on every request, so it's
  // the one most likely to end up somewhere it shouldn't (logs, proxies,
  // crash reports). Staying signed in for months/years comes from
  // REFRESH_TOKEN_TTL_DAYS below instead - a long-lived, rotating token used
  // only to silently mint new access tokens, never sent on ordinary calls.
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(90),
  COOKIE_NAME: z.string().default('pakmaps_jwt'),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

  ADMIN_PANEL_ORIGIN: z.string().min(1),
  TRUST_PROXY: z.string().default('loopback'),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(120),

  TILE_SERVER_BASE_URL: z.string().default(''),
  GEOCODER_BASE_URL: z.string().default(''),
  ROUTING_BASE_URL: z.string().default(''),
  MAPIFY_V10_INTERNAL_TOKEN: z.string().default('').refine(
    (value) => value === '' || value.length >= 32,
    'MAPIFY_V10_INTERNAL_TOKEN must be empty or at least 32 characters'
  ),
  MAPIFY_V10_INTERNAL_TOKEN_FILE: z.string().default(''),

  MAP_MATCH_TIMEOUT_MS: z.coerce.number().int().min(250).max(1200).default(950),
  MAP_MATCH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(10).max(600).default(60),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // eslint-disable-next-line no-console
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

module.exports = parsed.data;
