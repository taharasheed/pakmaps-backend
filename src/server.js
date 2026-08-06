const env = require('./config/env');
const logger = require('./config/logger');
const sequelize = require('./config/database');
const { redis, queueConnection } = require('./config/redis');
const app = require('./app');
const { scheduleRepeatingJobs } = require('./jobs/scheduler');
const { startWorkers } = require('./jobs/workers');

let server;
let workers = [];

async function start() {
  await sequelize.authenticate();
  logger.info('Database connection established.');

  workers = startWorkers();
  await scheduleRepeatingJobs();
  logger.info('Background workers and schedulers started.');

  server = app.listen(env.PORT, () => {
    logger.info(`Pak Maps backend listening on port ${env.PORT} (${env.NODE_ENV}).`);
  });
}

async function shutdown(signal) {
  logger.info(`Received ${signal}, shutting down gracefully.`);
  try {
    if (server) await new Promise((resolve) => server.close(resolve));
    await Promise.all(workers.map((w) => w.close()));
    await sequelize.close();
    await redis.quit();
    await queueConnection.quit();
    logger.info('Shutdown complete.');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error during shutdown.');
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (err) => {
  logger.error({ err }, 'Unhandled promise rejection.');
});

start().catch((err) => {
  logger.error({ err }, 'Failed to start server.');
  process.exit(1);
});
