const asyncHandler = require('../../utils/asyncHandler');
const AppError = require('../../utils/AppError');
const { getServiceBySlug } = require('./registry');
const adapters = require('./adapters');
const { buildCacheKey, getCached, setCached } = require('./cache');
const { checkRateLimit } = require('./rateLimiter');
const { withConcurrencyLimit } = require('./concurrencyPool');
const { upstreamFetch } = require('./httpClient');
const { recordUsage } = require('./usageBuffer');
const { logActivity } = require('./activityLogger');
const { getClientIp, getDeviceInfo, getClientLocation } = require('../../utils/requestMeta');

function afterResponse({ req, slug, status, statusCode, latencyMs, cacheHit, input, output, adapter }) {
  recordUsage(slug, { success: status === 'success', cacheHit, latencyMs }).catch(() => {});
  const { lat, lon } = getClientLocation(req);
  logActivity({
    userId: req.user?.id || null,
    serviceSlug: slug,
    source: req.auth?.clientType || 'web',
    requestParams: adapter.activitySummary ? adapter.activitySummary(input, output) : input,
    responseSummary: adapter.isBinary ? null : summarize(output),
    status,
    statusCode,
    latencyMs,
    cacheHit,
    ipAddress: getClientIp(req),
    // The session (if any) already has the mobile app's self-reported device
    // meta from login - far more useful than re-parsing this one request's
    // User-Agent, which for a native app's HTTP client rarely identifies
    // anything. Only fall back to that for calls with no session at all.
    deviceInfo: req.auth?.deviceInfo || getDeviceInfo(req),
    lat,
    lon,
  }).catch(() => {});
}

// Activity logs should stay lightweight - store the full normalized output
// only if it's small, otherwise just note how big it was.
function summarize(output) {
  if (!output) return null;
  const json = JSON.stringify(output);
  return json.length > 2000 ? { truncated: true, byteLength: json.length } : output;
}

// adapterKeyOverride lets a caller share one service row's config/rate-limit/
// logging identity (slug) across two different underlying adapters - e.g.
// the tile proxy uses the single 'tiles' service for both raster and vector
// styles, but still needs the right fetch/cache-key logic per style.
function handleProxyRequest(handlerKeyOverride, adapterKeyOverride) {
  return asyncHandler(async (req, res) => {
    const slug = handlerKeyOverride || req.params.slug;
    const service = await getServiceBySlug(slug);
    if (!service) throw new AppError(`Unknown service '${slug}'.`, 404);
    if (!service.isEnabled) throw new AppError(`The '${service.name}' service is currently disabled.`, 503);

    const adapter = adapters[adapterKeyOverride || service.handlerKey];
    if (!adapter) throw new AppError(`No handler registered for service '${slug}'.`, 500);

    await checkRateLimit({
      identity: req.user?.id || getClientIp(req),
      slug,
      max: service.rateLimitOverride || undefined,
    });

    const input = adapter.parseInput(req);
    const startedAt = Date.now();

    let cacheKey = null;
    if (service.cacheable && adapter.cacheKeyParts) {
      cacheKey = buildCacheKey(slug, adapter.cacheKeyParts(input));
      const cached = await getCached(cacheKey);
      if (cached) {
        const cacheLatencyMs = Date.now() - startedAt;
        afterResponse({ req, slug, status: 'success', statusCode: 200, latencyMs: cacheLatencyMs, cacheHit: true, input, output: cached, adapter });
        if (adapter.isBinary) {
          res.setHeader('Content-Type', cached.contentType || 'application/octet-stream');
          return res.status(200).send(Buffer.from(cached.body, 'base64'));
        }
        return res.status(200).json({ success: true, message: 'OK', data: cached });
      }
    }

    let statusCode = 200;
    let output;

    const doUpstreamFetch = async () => {
      const upstreamReq = adapter.buildUpstreamRequest(input, service, req);
      const upstreamRes = await upstreamFetch(upstreamReq.url, {
        method: upstreamReq.method,
        headers: upstreamReq.headers,
        body: upstreamReq.body,
      });

      statusCode = upstreamRes.status;
      if (!upstreamRes.ok) {
        throw new AppError(`Upstream service returned an error (${upstreamRes.status}).`, 502);
      }

      if (adapter.isBinary) {
        const buf = Buffer.from(await upstreamRes.arrayBuffer());
        return { buf, contentType: upstreamRes.headers.get('content-type') || 'application/octet-stream' };
      }

      const json = await upstreamRes.json();
      return adapter.normalizeResponse(json, input);
    };

    try {
      // An adapter can opt out of the shared concurrency pool/circuit
      // breaker entirely (extraVectorTiles does, as of 2026-08-18) when a
      // normal, expected non-2xx response (e.g. a 404 for a tile z/x/y with
      // no data - not an actual upstream fault) would otherwise get counted
      // as a breaker failure and trip it for every other request on the same
      // slug, including ones that would've succeeded.
      output = adapter.skipConcurrencyLimit
        ? await doUpstreamFetch()
        : await withConcurrencyLimit(slug, service.concurrencyLimit, doUpstreamFetch);
    } catch (err) {
      const latencyMs = Date.now() - startedAt;
      afterResponse({ req, slug, status: 'error', statusCode: err.statusCode || 502, latencyMs, cacheHit: false, input, output: null, adapter });
      throw err;
    }

    const latencyMs = Date.now() - startedAt;

    if (adapter.isBinary) {
      if (cacheKey) {
        setCached(cacheKey, { body: output.buf.toString('base64'), contentType: output.contentType }, service.cacheTtlSeconds).catch(() => {});
      }
      afterResponse({ req, slug, status: 'success', statusCode, latencyMs, cacheHit: false, input, output: null, adapter });
      res.setHeader('Content-Type', output.contentType);
      return res.status(200).send(output.buf);
    }

    if (cacheKey) {
      setCached(cacheKey, output, service.cacheTtlSeconds).catch(() => {});
    }
    afterResponse({ req, slug, status: 'success', statusCode, latencyMs, cacheHit: false, input, output, adapter });
    return res.status(200).json({ success: true, message: 'OK', data: output });
  });
}

module.exports = { handleProxyRequest };
