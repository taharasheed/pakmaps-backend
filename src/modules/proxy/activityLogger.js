const { redis } = require('../../config/redis');
const { ApiActivityLog } = require('../../db/models');
const logger = require('../../config/logger');

const LIST_KEY = 'activitylog:buffer';
const MAX_BUFFER_LENGTH = 200_000; // safety cap if the flush job is ever down
const BATCH_SIZE = 500;

// Called on the hot path - a single RPUSH, never blocks on Postgres.
async function logActivity(entry) {
  await redis.rpush(LIST_KEY, JSON.stringify({ ...entry, createdAt: new Date().toISOString() }));
  await redis.ltrim(LIST_KEY, -MAX_BUFFER_LENGTH, -1);
}

// Called by the periodic flush job - drains the buffer into Postgres in bulk.
async function flushActivityLogs() {
  const raw = await redis.lpop(LIST_KEY, BATCH_SIZE);
  if (!raw || raw.length === 0) return 0;

  const rows = raw
    .map((item) => {
      try {
        const parsed = JSON.parse(item);
        return {
          userId: parsed.userId || null,
          serviceSlug: parsed.serviceSlug,
          source: parsed.source,
          requestParams: parsed.requestParams || null,
          responseSummary: parsed.responseSummary || null,
          status: parsed.status,
          statusCode: parsed.statusCode || null,
          latencyMs: parsed.latencyMs || null,
          cacheHit: !!parsed.cacheHit,
          ipAddress: parsed.ipAddress || null,
          deviceInfo: parsed.deviceInfo || null,
          lat: parsed.lat ?? null,
          lon: parsed.lon ?? null,
          createdAt: parsed.createdAt,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  if (rows.length === 0) return 0;

  await ApiActivityLog.bulkCreate(rows);
  return rows.length;
}

async function drainAllActivityLogs() {
  let totalFlushed = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const count = await flushActivityLogs().catch((err) => {
      logger.error({ err }, 'Failed to flush activity log batch');
      return 0;
    });
    totalFlushed += count;
    if (count < BATCH_SIZE) break;
  }
  return totalFlushed;
}

module.exports = { logActivity, flushActivityLogs, drainAllActivityLogs };
