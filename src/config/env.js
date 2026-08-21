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
  // Ceiling on a user's *combined* requests across every proxy service in one
  // window - separate from each service's own limit above. Without this, a
  // user spread across several services (each within its own limit) has no
  // cap on total throughput. Set above the highest single service override
  // in use (tiles is 600) so normal heavy single-service usage isn't
  // penalized, but well below the naive sum of all overrides (~1080), so
  // spreading load across services for more total throughput is still capped.
  RATE_LIMIT_GLOBAL_MAX_REQUESTS: z.coerce.number().int().positive().default(800),

  TILE_SERVER_BASE_URL: z.string().default(''),
  // Fonts/sprites for the vector style are generic, non-sensitive static
  // assets already served publicly (unauthenticated) at this existing
  // domain, straight off the tile renderer - reused here rather than
  // re-proxying them through our own authed API for no benefit. The actual
  // vector tile *data* still goes through our own proxy below, same as
  // every other capability in this system.
  TILES_PUBLIC_ASSET_BASE_URL: z.string().default('https://tiles-client-deployment.mapifyit.com'),
  GEOCODER_BASE_URL: z.string().default(''),
  ROUTING_BASE_URL: z.string().default(''),
  // Valhalla's ETAs run on static per-road-class average speeds only (no
  // live traffic layer is deployed), so they trend high vs real Pakistani
  // traffic. 0.764 = 1/1.309, the median (route-duration / Google-live-
  // traffic-duration) ratio measured across a 30-route benchmark spanning 8
  // major cities on 2026-08-18 - not a guess. This is a stopgap multiplier
  // on the duration Valhalla returns, not a real fix (that needs a live
  // traffic feed); kept as an env knob so it can be re-tuned or disabled (1)
  // without a code change as more benchmark data comes in.
  ROUTING_DURATION_SCALE: z.coerce.number().positive().default(0.764),
  MAPIFY_V10_INTERNAL_TOKEN: z.string().default('').refine(
    (value) => value === '' || value.length >= 32,
    'MAPIFY_V10_INTERNAL_TOKEN must be empty or at least 32 characters'
  ),
  MAPIFY_V10_INTERNAL_TOKEN_FILE: z.string().default(''),

  MAP_MATCH_TIMEOUT_MS: z.coerce.number().int().min(250).max(1200).default(950),
  MAP_MATCH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(10).max(600).default(60),

  // Container-internal path - mounted from a host bind volume in
  // docker-compose.yml so uploaded files survive restarts/rebuilds.
  IMAGERY_LAYERS_DIR: z.string().default('/app/data/imagery-layers'),
  IMAGERY_LAYERS_MAX_BYTES: z.coerce.number().int().positive().default(1073741824),

  // notification-hub is a separate, standalone service - Pak Maps is just one
  // of its tenant apps. Both default to '' (not required) so a deployment
  // that hasn't registered with it yet still boots fine; the notificationHub
  // module treats an unconfigured URL/key as "feature disabled", not an error.
  NOTIFICATION_HUB_URL: z.string().default(''),
  NOTIFICATION_HUB_API_KEY: z.string().default(''),

  // Per PAKMAPS_R1_PUSH_BACKEND_IMPLEMENTATION_GUIDE.md's "Scope and
  // rollout": this backend deployment only issues R1 Push subscription
  // credentials when this is explicitly 'custom' AND the client's own
  // request also sends pushProvider: 'custom' (see auth.validation.js) -
  // both must agree, so an FCM/APNs build (or an older client that doesn't
  // send pushProvider at all) never triggers R1 registration even if it
  // happens to send R1-looking fields.
  PUSH_NOTIFICATION_PROVIDER: z.enum(['', 'custom']).default(''),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // eslint-disable-next-line no-console
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

module.exports = parsed.data;
