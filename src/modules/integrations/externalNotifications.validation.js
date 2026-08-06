const { z } = require('zod');

const createNotificationSchema = z.object({
  body: z.object({
    externalRecipientId: z.string().min(1).max(150),
    type: z.string().min(1).max(60),
    title: z.string().min(1).max(200),
    message: z.string().min(1).max(1000),
    meta: z.record(z.string(), z.any()).optional(),
  }),
  query: z.any().optional(),
  params: z.any().optional(),
});

const listNotificationsSchema = z.object({
  query: z.object({
    externalRecipientId: z.string().min(1).max(150),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    isRead: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === 'true')),
  }),
  body: z.any().optional(),
  params: z.any().optional(),
});

const markReadParamsSchema = z.object({
  body: z.any().optional(),
  query: z.any().optional(),
  params: z.object({ id: z.string().uuid() }),
});

const markAllReadSchema = z.object({
  query: z.object({ externalRecipientId: z.string().min(1).max(150) }),
  body: z.any().optional(),
  params: z.any().optional(),
});

module.exports = { createNotificationSchema, listNotificationsSchema, markReadParamsSchema, markAllReadSchema };
