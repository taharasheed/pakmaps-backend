const { z } = require('zod');

const usageReportSchema = z.object({
  query: z.object({
    from: z.string().date(),
    to: z.string().date(),
    serviceSlug: z.string().optional(),
  }),
  body: z.any().optional(),
  params: z.any().optional(),
});

const activityLogSchema = z.object({
  query: z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    serviceSlug: z.string().optional(),
    userId: z.string().uuid().optional(),
    status: z.enum(['success', 'error']).optional(),
    source: z.enum(['web', 'mobile']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(50),
  }),
  body: z.any().optional(),
  params: z.any().optional(),
});

module.exports = { usageReportSchema, activityLogSchema };
