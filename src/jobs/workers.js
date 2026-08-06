const { Worker } = require('bullmq');
const { QUEUE_NAMES, connection } = require('../config/queue');
const logger = require('../config/logger');
const { runHealthChecks } = require('../modules/health/health.checker');
const { flushAllUsage } = require('../modules/proxy/usageBuffer');
const { drainAllActivityLogs } = require('../modules/proxy/activityLogger');

const processors = {
  [QUEUE_NAMES.HEALTH_CHECK]: runHealthChecks,
  [QUEUE_NAMES.USAGE_FLUSH]: flushAllUsage,
  [QUEUE_NAMES.ACTIVITY_LOG]: drainAllActivityLogs,
};

function startWorkers() {
  const workers = Object.entries(processors).map(([queueName, handler]) => {
    const worker = new Worker(
      queueName,
      async () => {
        await handler();
      },
      { connection }
    );

    worker.on('failed', (job, err) => {
      logger.error({ err, queueName, jobId: job?.id }, 'Background job failed');
    });

    return worker;
  });

  return workers;
}

module.exports = { startWorkers };
