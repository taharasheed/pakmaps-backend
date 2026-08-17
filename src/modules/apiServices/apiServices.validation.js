const { z } = require('zod');

const idParam = z.object({ id: z.string().uuid() });

const updateServiceSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(150).optional(),
    baseUrl: z.string().max(500).optional(),
    isEnabled: z.boolean().optional(),
    healthCheckPath: z.string().max(300).nullable().optional(),
    rateLimitOverride: z.number().int().positive().nullable().optional(),
    cacheTtlSeconds: z.number().int().min(0).optional(),
    cacheable: z.boolean().optional(),
    concurrencyLimit: z.number().int().positive().max(1000).optional(),
  }),
  query: z.any().optional(),
  params: idParam,
});

const listServicesSchema = z.object({
  body: z.any().optional(),
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(20),
  }),
  params: z.any().optional(),
});

module.exports = { idParam, updateServiceSchema, listServicesSchema };
