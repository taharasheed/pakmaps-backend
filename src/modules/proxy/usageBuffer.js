const { redis } = require('../../config/redis');
const { ApiUsageDaily, sequelize } = require('../../db/models');
const logger = require('../../config/logger');
const { getAllServices } = require('./registry');

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function keysFor(slug, date) {
  const prefix = `usage:${slug}:${date}`;
  return {
    total: `${prefix}:total`,
    success: `${prefix}:success`,
    error: `${prefix}:error`,
    cacheHits: `${prefix}:cacheHits`,
    latencySum: `${prefix}:latencySum`,
    latencyCount: `${prefix}:latencyCount`,
  };
}

// Called on the hot path - Redis INCR only, never touches Postgres directly.
async function recordUsage(slug, { success, cacheHit, latencyMs }) {
  const keys = keysFor(slug, todayKey());
  const pipeline = redis.pipeline();
  pipeline.incr(keys.total);
  pipeline.incr(success ? keys.success : keys.error);
  if (cacheHit) pipeline.incr(keys.cacheHits);
  if (typeof latencyMs === 'number') {
    pipeline.incrby(keys.latencySum, Math.round(latencyMs));
    pipeline.incr(keys.latencyCount);
  }
  // Safety-net expiry in case the flush job is ever down for a while.
  Object.values(keys).forEach((k) => pipeline.expire(k, 60 * 60 * 48));
  await pipeline.exec();
}

async function drainCounterKey(key) {
  const [[, value]] = await redis.multi().get(key).del(key).exec();
  return Number(value) || 0;
}

// Called by the periodic flush job - drains Redis deltas into Postgres.
async function flushServiceDate(serviceId, slug, date) {
  const keys = keysFor(slug, date);
  const [total, success, error, cacheHits, latencySum, latencyCount] = await Promise.all([
    drainCounterKey(keys.total),
    drainCounterKey(keys.success),
    drainCounterKey(keys.error),
    drainCounterKey(keys.cacheHits),
    drainCounterKey(keys.latencySum),
    drainCounterKey(keys.latencyCount),
  ]);

  if (total === 0) return;

  await sequelize.transaction(async (t) => {
    const [row] = await ApiUsageDaily.findOrCreate({
      where: { serviceId, date },
      defaults: { serviceId, date, totalCalls: 0, successCalls: 0, errorCalls: 0, cacheHits: 0, avgLatencyMs: 0 },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    const priorTotal = Number(row.totalCalls);
    const newTotal = priorTotal + total;
    const newAvgLatency =
      latencyCount > 0 ? (row.avgLatencyMs * priorTotal + latencySum) / newTotal : row.avgLatencyMs;

    await row.update(
      {
        totalCalls: newTotal,
        successCalls: Number(row.successCalls) + success,
        errorCalls: Number(row.errorCalls) + error,
        cacheHits: Number(row.cacheHits) + cacheHits,
        avgLatencyMs: newAvgLatency,
      },
      { transaction: t }
    );
  });
}

async function flushAllUsage() {
  const services = await getAllServices({ fresh: true });
  const today = todayKey();
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  for (const service of services) {
    try {
      await flushServiceDate(service.id, service.slug, today);
      await flushServiceDate(service.id, service.slug, yesterday);
    } catch (err) {
      logger.error({ err, slug: service.slug }, 'Failed to flush usage stats');
    }
  }
}

module.exports = { recordUsage, flushAllUsage };
