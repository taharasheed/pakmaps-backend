const AppError = require('../../utils/AppError');
const logger = require('../../config/logger');

// Bounded concurrency + circuit breaker per upstream service, scoped to this
// process. Protects the upstream from being hit by more simultaneous calls
// than it can handle, and fails fast instead of queueing requests unboundedly
// when the upstream is already struggling.
//
// Note: this is per-instance, not cluster-wide. If this backend ever runs as
// multiple replicas, the *effective* ceiling per upstream becomes
// (replicas x concurrencyLimit) - acceptable for v1, but worth moving to a
// Redis-backed semaphore if true cross-instance coordination is needed later.

const MAX_QUEUE_WAIT_MS = 3000;
const BREAKER_ERROR_THRESHOLD = 0.5; // trip if >=50% of the last window's calls failed
const BREAKER_MIN_SAMPLES = 10;
const BREAKER_COOLDOWN_MS = 15_000;
const BREAKER_WINDOW_SIZE = 30;

const state = new Map();

function getState(slug, concurrencyLimit) {
  if (!state.has(slug)) {
    state.set(slug, {
      active: 0,
      limit: concurrencyLimit,
      waitQueue: [],
      results: [], // rolling window of true=success/false=error
      breakerOpenUntil: 0,
    });
  }
  const s = state.get(slug);
  s.limit = concurrencyLimit; // keep in sync with the (admin-editable) registry value
  return s;
}

function isBreakerOpen(s) {
  return Date.now() < s.breakerOpenUntil;
}

function recordResult(s, success) {
  s.results.push(success);
  if (s.results.length > BREAKER_WINDOW_SIZE) s.results.shift();

  if (s.results.length >= BREAKER_MIN_SAMPLES) {
    const errorRate = s.results.filter((r) => !r).length / s.results.length;
    if (errorRate >= BREAKER_ERROR_THRESHOLD) {
      s.breakerOpenUntil = Date.now() + BREAKER_COOLDOWN_MS;
      s.results = [];
      logger.warn({ errorRate }, 'Circuit breaker tripped for upstream service');
    }
  }
}

async function acquire(slug, concurrencyLimit) {
  const s = getState(slug, concurrencyLimit);

  if (isBreakerOpen(s)) {
    throw new AppError('This service is temporarily unavailable. Please try again shortly.', 503);
  }

  if (s.active < s.limit) {
    s.active += 1;
    return;
  }

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = s.waitQueue.indexOf(entry);
      if (idx !== -1) s.waitQueue.splice(idx, 1);
      reject(new AppError('Service is under heavy load. Please try again shortly.', 503));
    }, MAX_QUEUE_WAIT_MS);

    const entry = { resolve: () => { clearTimeout(timer); resolve(); }, reject };
    s.waitQueue.push(entry);
  });

  s.active += 1;
}

function release(slug, success) {
  const s = state.get(slug);
  if (!s) return;
  s.active = Math.max(0, s.active - 1);
  recordResult(s, success);

  const next = s.waitQueue.shift();
  if (next) next.resolve();
}

async function withConcurrencyLimit(slug, concurrencyLimit, fn) {
  await acquire(slug, concurrencyLimit);
  let success = false;
  try {
    const result = await fn();
    success = true;
    return result;
  } finally {
    release(slug, success);
  }
}

function getBreakerStatus(slug) {
  const s = state.get(slug);
  if (!s) return { open: false, activeCalls: 0 };
  return { open: isBreakerOpen(s), activeCalls: s.active };
}

module.exports = { withConcurrencyLimit, getBreakerStatus };
