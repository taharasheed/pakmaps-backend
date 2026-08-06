const Redis = require('ioredis');
const env = require('./env');
const logger = require('./logger');

function createClient(name) {
  const client = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  });

  client.on('error', (err) => logger.error({ err, client: name }, 'Redis client error'));
  client.on('connect', () => logger.info({ client: name }, 'Redis client connected'));

  return client;
}

// Separate connections: BullMQ requires its own dedicated connections
// (blocking commands), kept apart from the general-purpose cache/rate-limit client.
const redis = createClient('general');
const queueConnection = createClient('queue');

module.exports = { redis, queueConnection };
