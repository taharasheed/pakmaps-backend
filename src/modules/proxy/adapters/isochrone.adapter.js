const { z } = require('zod');

const contourSchema = z.object({
  timeMinutes: z.number().positive().max(120).optional(),
  distanceKm: z.number().positive().max(200).optional(),
});

const bodySchema = z
  .object({
    origin: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }),
    costing: z.enum(['auto', 'bus', 'bicycle', 'pedestrian', 'motorcycle']),
    contours: z.array(contourSchema).min(1).max(4),
    polygons: z.boolean().default(true),
  })
  .refine((data) => data.contours.every((c) => c.timeMinutes || c.distanceKm), {
    message: 'Each contour needs either timeMinutes or distanceKm.',
  });

const isBinary = false;

function parseInput(req) {
  return bodySchema.parse(req.body);
}

function buildUpstreamRequest(input, service) {
  const contours = input.contours.map((c) =>
    c.timeMinutes ? { time: c.timeMinutes } : { distance: c.distanceKm }
  );

  const body = {
    locations: [{ lat: input.origin.lat, lon: input.origin.lon }],
    costing: input.costing,
    contours,
    polygons: input.polygons,
  };

  return {
    method: 'GET',
    url: `${service.baseUrl}/isochrone?json=${encodeURIComponent(JSON.stringify(body))}`,
  };
}

function normalizeResponse(upstreamJson) {
  return { type: 'FeatureCollection', features: upstreamJson.features || [] };
}

function cacheKeyParts(input) {
  return `${input.origin.lat.toFixed(5)},${input.origin.lon.toFixed(5)}:${input.costing}:${JSON.stringify(input.contours)}`;
}

function activitySummary(input) {
  return { origin: input.origin, costing: input.costing, contours: input.contours };
}

module.exports = { isBinary, parseInput, buildUpstreamRequest, normalizeResponse, cacheKeyParts, activitySummary };
