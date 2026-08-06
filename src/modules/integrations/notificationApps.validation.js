const { z } = require('zod');

const idParam = z.object({ id: z.string().uuid() });

const createAppSchema = z.object({
  body: z.object({ name: z.string().min(2).max(150) }),
  query: z.any().optional(),
  params: z.any().optional(),
});

const updateAppSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(150).optional(),
    isActive: z.boolean().optional(),
  }),
  query: z.any().optional(),
  params: idParam,
});

const idOnlySchema = z.object({ body: z.any().optional(), query: z.any().optional(), params: idParam });

module.exports = { createAppSchema, updateAppSchema, idOnlySchema };
