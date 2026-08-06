const { redis } = require('../../config/redis');

function buildCacheKey(slug, keyParts) {
  return `proxycache:${slug}:${keyParts}`;
}

async function getCached(key) {
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function setCached(key, value, ttlSeconds) {
  if (!ttlSeconds || ttlSeconds <= 0) return;
  await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
}

module.exports = { buildCacheKey, getCached, setCached };
