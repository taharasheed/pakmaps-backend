const { z } = require('zod');
const { normalizeFeatureCollection } = require('./peliasNormalize');

// Triggered on every keystroke (onChange) - hits the upstream's fast
// autocomplete endpoint, not the full search endpoint. See search.adapter.js
// for the explicit button/enter search variant. (Was named "geocoding" -
// renamed since this hits /v10/autocomplete, not a geocoder.)
const querySchema = z.object({
  q: z.string().min(1).max(200),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lon: z.coerce.number().min(-180).max(180).optional(),
  boundary_country: z.string().max(100).optional(),
  size: z.coerce.number().int().min(1).max(40).default(10),
});

const isBinary = false;

function parseInput(req) {
  return querySchema.parse(req.query);
}

function buildUpstreamRequest(input, service, req) {
  const params = new URLSearchParams();
  params.set('text', input.q);
  if (input.lat !== undefined) params.set('focus.point.lat', String(input.lat));
  if (input.lon !== undefined) params.set('focus.point.lon', String(input.lon));
  if (input.boundary_country) params.set('boundary.country', input.boundary_country);
  params.set('size', String(input.size));

  return {
    method: 'GET',
    url: `${service.baseUrl}/v10/autocomplete?${params.toString()}`,
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
  return normalizeFeatureCollection(upstreamJson);
}

function cacheKeyParts(input) {
  return `${input.q.trim().toLowerCase()}:${round(input.lat)}:${round(input.lon)}:${input.boundary_country || ''}:${input.size}`;
}

function round(n) {
  return typeof n === 'number' ? n.toFixed(5) : '';
}

function activitySummary(input, output) {
  return { query: input.q, resultCount: output?.results?.length ?? 0 };
}

module.exports = { isBinary, parseInput, buildUpstreamRequest, normalizeResponse, cacheKeyParts, activitySummary };
