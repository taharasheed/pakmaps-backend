const { QUEUE_NAMES, queues } = require('../config/queue');

// Repeatable jobs are deduped by BullMQ across however many instances of this
// backend are running - so scaling horizontally never causes duplicate health
// pings or duplicate flush runs.
//
// removeOnComplete/removeOnFail matter a lot here specifically because these
// jobs repeat forever (every 5-30s) - without a limit, BullMQ keeps every
// single completed job's Redis record permanently. That silently grew to
// 100k+ stale keys in Redis over time, since nothing was ever trimming them.
// Keeping the last 50 is plenty for debugging a stuck run; keeping all of
// them forever serves no purpose.
const KEEP_RECENT = { removeOnComplete: 50, removeOnFail: 50 };

async function scheduleRepeatingJobs() {
  await queues[QUEUE_NAMES.HEALTH_CHECK].upsertJobScheduler(
    'health-check-scheduler',
    { every: 30_000 },
    { name: 'run-health-checks', opts: KEEP_RECENT }
  );

  await queues[QUEUE_NAMES.USAGE_FLUSH].upsertJobScheduler(
    'usage-flush-scheduler',
    { every: 20_000 },
    { name: 'flush-usage-stats', opts: KEEP_RECENT }
  );

  await queues[QUEUE_NAMES.ACTIVITY_LOG].upsertJobScheduler(
    'activity-log-flush-scheduler',
    { every: 5_000 },
    { name: 'flush-activity-logs', opts: KEEP_RECENT }
  );
}

module.exports = { scheduleRepeatingJobs };
