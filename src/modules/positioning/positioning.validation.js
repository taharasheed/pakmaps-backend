const { z } = require('zod');

// Wire format stays snake_case (matches the mobile-side contract); everything
// past validation is normalized to camelCase for the rest of the module.
const wifiObservationSchema = z
  .object({
    bssid: z.string().min(1),
    rssi_dbm: z.number().int(),
    frequency_mhz: z.number().int().positive().optional(),
    channel_width: z.number().int().optional(),
    connected: z.boolean().default(false),
    age_ms: z.number().int().nonnegative().default(0),
  })
  .transform((w) => ({
    bssid: w.bssid,
    rssiDbm: w.rssi_dbm,
    frequencyMhz: w.frequency_mhz ?? null,
    channelWidth: w.channel_width ?? null,
    connected: w.connected,
    ageMs: w.age_ms,
  }));

const cellObservationSchema = z
  .object({
    radio: z.enum(['gsm', 'wcdma', 'lte', 'nr', 'cdma']),
    mcc: z.string().min(1).max(6),
    mnc: z.string().min(1).max(6),
    area: z.number().int().nonnegative().optional(),
    cell_id: z.number().int().nonnegative().optional(),
    pci: z.number().int().nonnegative().optional(),
    channel: z.number().int().nonnegative().optional(),
    registered: z.boolean().default(false),
    signal_dbm: z.number().int().optional(),
    age_ms: z.number().int().nonnegative().default(0),
  })
  .transform((c) => ({
    radio: c.radio,
    mcc: c.mcc,
    mnc: c.mnc,
    area: c.area ?? null,
    cellId: c.cell_id ?? null,
    pci: c.pci ?? null,
    channel: c.channel ?? null,
    registered: c.registered,
    signalDbm: c.signal_dbm ?? null,
    ageMs: c.age_ms,
  }));

const baseSnapshotFields = {
  schema_version: z.literal(1).default(1),
  observation_id: z.string().uuid(),
  installation_id: z.string().min(1).max(100),
  captured_at: z.string().datetime(),
  platform: z.enum(['android', 'ios']),
  app_version: z.string().max(30).optional(),
  collector: z
    .object({
      status: z.string().max(30).optional(),
      collection_latency_ms: z.number().int().nonnegative().optional(),
      wifi_enabled: z.boolean().optional(),
      location_enabled: z.boolean().optional(),
      active_scan_requested: z.boolean().optional(),
    })
    .optional(),
  wifi: z.array(wifiObservationSchema).max(50).default([]),
  cells: z.array(cellObservationSchema).max(10).default([]),
};

const resolveBodySchema = z.object({
  body: z.object(baseSnapshotFields),
  query: z.any().optional(),
  params: z.any().optional(),
});

const anchorSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  altitude_m: z.number().optional(),
  horizontal_accuracy_m: z.number().positive(),
  captured_at: z.string().datetime(),
  source: z.string().min(1).max(30),
  is_mocked: z.boolean().default(false),
});

const observationsBodySchema = z.object({
  body: z.object({ ...baseSnapshotFields, anchor: anchorSchema.optional() }),
  query: z.any().optional(),
  params: z.any().optional(),
});

// Trajectory points reference an existing GNSS anchor by metadata only (no
// lat/lng here) - the real anchor position is resolved server-side from the
// matching /observations record, never trusted from the client on this call.
const trajectoryAnchorSchema = z.object({
  captured_at: z.string().datetime(),
  horizontal_accuracy_m: z.number().positive().max(25),
  age_ms: z.number().int().nonnegative().max(60000),
  source: z.string().min(1).max(30),
});

const inferredPositionSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  horizontal_uncertainty_m: z.number().positive().max(30),
  captured_at: z.string().datetime(),
  source: z.literal('pdr_inferred'),
});

const motionSchema = z.object({
  distance_since_anchor_m: z.number().positive().max(30),
  steps_since_anchor: z.number().int().positive(),
  heading_deg: z.number().min(0).lt(360),
  heading_accuracy_deg: z.number().positive().max(25),
});

const trajectoryBodySchema = z.object({
  body: z.object({
    ...baseSnapshotFields,
    inferred_position: inferredPositionSchema,
    anchor: trajectoryAnchorSchema,
    motion: motionSchema,
  }),
  query: z.any().optional(),
  params: z.any().optional(),
});

module.exports = { resolveBodySchema, observationsBodySchema, trajectoryBodySchema };
