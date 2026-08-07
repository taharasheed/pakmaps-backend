const env = require('../../config/env');
const { upstreamFetch } = require('../proxy/httpClient');
const { checkRateLimit } = require('../proxy/rateLimiter');
const { buildCacheKey, getCached, setCached } = require('../proxy/cache');
const {
  ContractError,
  validateMapMatchRequest,
  buildValhallaRequest,
  translateValhallaResponse,
} = require('./mapMatch.contract');

const MAX_BODY_BYTES = 16 * 1024;
// Idempotent-response window for a repeated (sessionGeneration, sequenceId)
// pair - covers the mobile client retrying after its own ~1.5s timeout
// without re-hitting Valhalla for a request we already answered.
const IDEMPOTENCY_TTL_SECONDS = 5;

// One in-flight map-match request per navigation session, enforced here at
// the application level (per doc requirement). In-memory/per-instance is an
// accepted tradeoff for v1, same precedent as the proxy concurrency pool.
const activeSessions = new Set();

function respond(res, statusCode, payload) {
  res.set('Cache-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  return res.status(statusCode).type('application/vnd.mapifyit.navigation.v1+json').send(JSON.stringify(payload));
}

function respondError(res, statusCode, code, retryable) {
  return respond(res, statusCode, { error: { code, retryable } });
}

// Metadata only - never add request bodies, coordinates, tokens, headers,
// or upstream payloads to this log line. See handoff doc section 9.
function safeLog(logger, fields) {
  logger.info(fields, 'map_match_request');
}

async function callValhalla(request) {
  const timeoutMs = env.MAP_MATCH_TIMEOUT_MS;
  const url = `${env.ROUTING_BASE_URL}/trace_attributes`;

  let upstreamRes;
  try {
    upstreamRes = await upstreamFetch(
      url,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(buildValhallaRequest(request)),
      },
      timeoutMs
    );
  } catch (caught) {
    if (caught?.name === 'AbortError') {
      const timeoutError = new Error('Valhalla timed out');
      timeoutError.code = 'UPSTREAM_TIMEOUT';
      throw timeoutError;
    }
    const networkError = new Error('Valhalla is unreachable');
    networkError.code = 'MATCHER_UNAVAILABLE';
    throw networkError;
  }

  if (!upstreamRes.ok) {
    const upstreamError = new Error('Valhalla rejected the request');
    upstreamError.code = 'MATCHER_UNAVAILABLE';
    throw upstreamError;
  }

  try {
    return await upstreamRes.json();
  } catch {
    const invalidError = new Error('Valhalla returned invalid JSON');
    invalidError.code = 'UPSTREAM_INVALID';
    throw invalidError;
  }
}

async function handleMapMatch(req, res) {
  const started = Date.now();
  // Deliberately NOT req.log: pino-http binds full request context (headers,
  // including Authorization) to that child logger, which would leak the
  // bearer token into every log line made through it. The plain base logger
  // has no such binding - only the fields explicitly passed to it are ever
  // logged, matching this endpoint's "never log tokens/headers" requirement.
  const logger = require('../../config/logger');

  const contentLength = Number(req.headers['content-length'] || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return respondError(res, 400, 'INVALID_REQUEST', false);
  }

  let request;
  try {
    request = validateMapMatchRequest(req.body);
  } catch (caught) {
    if (caught instanceof ContractError) {
      return respondError(res, 400, 'INVALID_REQUEST', false);
    }
    throw caught;
  }

  const idempotencyKey = buildCacheKey('mapmatch', `${req.user.id}:${request.sessionGeneration}:${request.sequenceId}`);
  const cached = await getCached(idempotencyKey);
  if (cached) {
    return respond(res, 200, cached);
  }

  try {
    await checkRateLimit({
      identity: `mapmatch:${req.user.id}`,
      windowMs: 60000,
      max: env.MAP_MATCH_RATE_LIMIT_PER_MINUTE,
    });
  } catch {
    return respondError(res, 429, 'RATE_LIMITED', true);
  }

  const sessionKey = `${req.user.id}:${request.sessionGeneration}`;
  if (activeSessions.has(sessionKey)) {
    return respondError(res, 429, 'RATE_LIMITED', true);
  }
  activeSessions.add(sessionKey);

  try {
    const upstream = await callValhalla(request);

    let response;
    try {
      response = translateValhallaResponse(request, upstream);
    } catch (caught) {
      if (caught instanceof ContractError) {
        const invalidError = new Error('Valhalla response schema is invalid');
        invalidError.code = 'UPSTREAM_INVALID';
        throw invalidError;
      }
      throw caught;
    }

    const latencyMs = Date.now() - started;
    response.serverTimingMs = latencyMs;

    safeLog(logger, {
      requestId: request.requestId,
      sequenceId: request.sequenceId,
      status: response.status,
      sampleCount: request.samples.length,
      latencyMs,
    });

    setCached(idempotencyKey, response, IDEMPOTENCY_TTL_SECONDS).catch(() => {});
    return respond(res, 200, response);
  } catch (caught) {
    const code = caught?.code === 'UPSTREAM_TIMEOUT' || caught?.code === 'UPSTREAM_INVALID'
      ? caught.code
      : 'MATCHER_UNAVAILABLE';

    safeLog(logger, {
      requestId: request.requestId,
      sequenceId: request.sequenceId,
      status: 'error',
      code,
      sampleCount: request.samples.length,
      latencyMs: Date.now() - started,
    });

    return respondError(res, code === 'UPSTREAM_TIMEOUT' ? 504 : 503, code, true);
  } finally {
    activeSessions.delete(sessionKey);
  }
}

module.exports = { handleMapMatch };
