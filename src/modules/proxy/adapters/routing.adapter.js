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
    units: input.units,
    alternates: input.alternates,
  };
  if (input.costing_options) body.costing_options = input.costing_options;

  return {
    method: 'POST',
    url: `${service.baseUrl}/route`,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function normalizeSignElements(elements) {
  return (elements || []).map((el) => ({
    text: el.text,
    consecutiveCount: el.consecutive_count ?? null,
  }));
}

function normalizeSign(sign) {
  if (!sign) return null;
  return {
    exitNumber: normalizeSignElements(sign.exit_number_elements),
    exitBranch: normalizeSignElements(sign.exit_branch_elements),
    exitToward: normalizeSignElements(sign.exit_toward_elements),
    exitName: normalizeSignElements(sign.exit_name_elements),
  };
}

function normalizeManeuver(maneuver) {
  return {
    type: maneuver.type,
    instruction: maneuver.instruction,
    verbalTransitionAlertInstruction: maneuver.verbal_transition_alert_instruction ?? null,
    verbalPreInstruction: maneuver.verbal_pre_transition_instruction ?? null,
    verbalPostInstruction: maneuver.verbal_post_transition_instruction ?? null,
    verbalMultiCue: maneuver.verbal_multi_cue ?? false,
    streetNames: maneuver.street_names || [],
    distance: maneuver.length ?? null,
    duration: maneuver.time ?? null,
    beginShapeIndex: maneuver.begin_shape_index,
    endShapeIndex: maneuver.end_shape_index,
    sign: normalizeSign(maneuver.sign),
    roundaboutExitCount: maneuver.roundabout_exit_count ?? null,
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
      maneuvers: (leg.maneuvers || []).map(normalizeManeuver),
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
