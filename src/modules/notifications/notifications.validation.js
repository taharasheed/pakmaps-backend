const { z } = require('zod');

const listNotificationsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    // z.coerce.boolean() would turn the string "false" into `true` (Boolean("false")
    // is truthy) - enum + explicit transform avoids that trap.
    isRead: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === 'true')),
  }),
  body: z.any().optional(),
  params: z.any().optional(),
});

module.exports = { listNotificationsSchema };
