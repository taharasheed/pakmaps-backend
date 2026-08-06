const { z } = require('zod');

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

const bodySchema = z.object({
  locations: z.array(locationSchema).min(2, 'At least 2 locations are required.'),
  costing: z.enum(['auto', 'bus', 'bicycle', 'pedestrian', 'motorcycle']),
  alternates: z.coerce.number().int().min(0).max(3).default(0),
  units: z.enum(['kilometers', 'miles']).default('kilometers'),
  costing_options: z.record(z.string(), z.any()).optional(),
});

const isBinary = false;

function parseInput(req) {
  return bodySchema.parse(req.body);
}

function buildUpstreamRequest(input, service) {
  const body = {
    locations: input.locations.map((l) => ({ lat: l.lat, lon: l.lon })),
    costing: input.costing,
    directions_options: { units: input.units },
    alternates: input.alternates,
  };
  if (input.costing_options) body.costing_options = input.costing_options;

  return {
    method: 'GET',
    url: `${service.baseUrl}/route?json=${encodeURIComponent(JSON.stringify(body))}`,
  };
}

function normalizeTrip(trip) {
  if (!trip) return null;
  return {
    distance: trip.summary?.length ?? null,
    duration: trip.summary?.time ?? null,
    legs: (trip.legs || []).map((leg) => ({
      distance: leg.summary?.length ?? null,
      duration: leg.summary?.time ?? null,
      encodedPolyline: leg.shape || null,
    })),
  };
}

function normalizeResponse(upstreamJson, input) {
  const primary = normalizeTrip(upstreamJson.trip);
  const alternates = (upstreamJson.alternates || []).map((alt) => normalizeTrip(alt.trip));

  return {
    units: input.units,
    ...primary,
    alternates,
  };
}

function cacheKeyParts(input) {
  const points = input.locations.map((l) => `${l.lat.toFixed(5)},${l.lon.toFixed(5)}`).join('|');
  return `${points}:${input.costing}:${input.units}:${input.alternates}:${JSON.stringify(input.costing_options || {})}`;
}

function activitySummary(input, output) {
  const start = input.locations[0];
  const end = input.locations[input.locations.length - 1];
  return {
    start,
    end,
    waypointCount: input.locations.length,
    costing: input.costing,
    distance: output?.distance ?? null,
    duration: output?.duration ?? null,
  };
}

module.exports = { isBinary, parseInput, buildUpstreamRequest, normalizeResponse, cacheKeyParts, activitySummary };
