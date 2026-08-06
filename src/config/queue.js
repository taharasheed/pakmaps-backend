const { Queue } = require('bullmq');
const { queueConnection } = require('./redis');

const QUEUE_NAMES = {
  ACTIVITY_LOG: 'activity-log',
  USAGE_FLUSH: 'usage-flush',
  HEALTH_CHECK: 'health-check',
};

const connection = queueConnection;

const queues = {
  [QUEUE_NAMES.ACTIVITY_LOG]: new Queue(QUEUE_NAMES.ACTIVITY_LOG, { connection }),
  [QUEUE_NAMES.USAGE_FLUSH]: new Queue(QUEUE_NAMES.USAGE_FLUSH, { connection }),
  [QUEUE_NAMES.HEALTH_CHECK]: new Queue(QUEUE_NAMES.HEALTH_CHECK, { connection }),
};

module.exports = { QUEUE_NAMES, queues, connection };
