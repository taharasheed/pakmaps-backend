const { z } = require('zod');

const uploadMetaSchema = z.object({
  name: z.string().min(2).max(150),
  description: z.string().max(500).optional().default(''),
});

const idParam = z.object({ id: z.string().uuid() });
const idOnly = z.object({ body: z.any().optional(), query: z.any().optional(), params: idParam });

const toggleSchema = z.object({
  body: z.object({ isEnabled: z.boolean() }),
  query: z.any().optional(),
  params: idParam,
});

const listLayersSchema = z.object({
  body: z.any().optional(),
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(20),
  }),
  params: z.any().optional(),
});

function slugify(name) {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || 'layer'}-${Date.now().toString(36)}`;
}

module.exports = { uploadMetaSchema, idOnly, toggleSchema, listLayersSchema, slugify };
