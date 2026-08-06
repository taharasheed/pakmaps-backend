const { QUEUE_NAMES, queues } = require('../config/queue');

// Repeatable jobs are deduped by BullMQ across however many instances of this
// backend are running - so scaling horizontally never causes duplicate health
// pings or duplicate flush runs.
async function scheduleRepeatingJobs() {
  await queues[QUEUE_NAMES.HEALTH_CHECK].upsertJobScheduler(
    'health-check-scheduler',
    { every: 30_000 },
    { name: 'run-health-checks' }
  );

  await queues[QUEUE_NAMES.USAGE_FLUSH].upsertJobScheduler(
    'usage-flush-scheduler',
    { every: 20_000 },
    { name: 'flush-usage-stats' }
  );

  await queues[QUEUE_NAMES.ACTIVITY_LOG].upsertJobScheduler(
    'activity-log-flush-scheduler',
    { every: 5_000 },
    { name: 'flush-activity-logs' }
  );
}

module.exports = { scheduleRepeatingJobs };
