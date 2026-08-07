const { z } = require('zod');
const { normalizeFeatureCollection } = require('./peliasNormalize');

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  size: z.coerce.number().int().min(1).max(20).default(1),
});

const isBinary = false;

function parseInput(req) {
  return querySchema.parse(req.query);
}

function buildUpstreamRequest(input, service, req) {
  const params = new URLSearchParams();
  params.set('point.lat', String(input.lat));
  params.set('point.lon', String(input.lon));
  params.set('size', String(input.size));

  return {
    method: 'GET',
    url: `${service.baseUrl}/v10/reverse?${params.toString()}`,
    headers: mapifyUpstreamHeaders(req),
  };
}

function mapifyUpstreamHeaders(req) {
  return {
    accept: 'application/json',
    'x-authenticated-user': String(req?.user?.id || 'authenticated-user'),
    ...(req?.headers?.['accept-language']
      ? { 'accept-language': String(req.headers['accept-language']).slice(0, 128) }
      : {}),
  };
}

function normalizeResponse(upstreamJson) {
  return normalizeFeatureCollection(upstreamJson, { withDistance: true });
}

function cacheKeyParts(input) {
  return `${input.lat.toFixed(5)}:${input.lon.toFixed(5)}:${input.size}`;
}

function activitySummary(input, output) {
  return { lat: input.lat, lon: input.lon, topLabel: output?.results?.[0]?.label || null };
}

module.exports = { isBinary, parseInput, buildUpstreamRequest, normalizeResponse, cacheKeyParts, activitySummary };
