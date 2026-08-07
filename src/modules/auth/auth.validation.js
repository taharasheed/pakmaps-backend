const { z } = require('zod');

// Optional device context a mobile client can attach at login - all optional
// so older app builds that don't send these yet keep working unchanged.
const deviceMetaSchema = z.object({
  deviceId: z.string().max(200).optional(),
  platform: z.string().max(50).optional(),
  model: z.string().max(100).optional(),
  brand: z.string().max(100).optional(),
  appVersion: z.string().max(50).optional(),
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1),
    clientType: z.enum(['web', 'mobile']).default('web'),
  }).merge(deviceMetaSchema),
  query: z.any().optional(),
  params: z.any().optional(),
});

const signupSchema = z.object({
  body: z
    .object({
      name: z.string().min(2).max(150),
      email: z.string().email(),
      phone: z.string().regex(/^\+?[0-9]{7,15}$/, 'Enter a valid phone number.'),
      gender: z.enum(['male', 'female', 'other']),
      password: z.string().min(8),
      confirmPassword: z.string().min(8),
    })
    .merge(deviceMetaSchema)
    .refine((data) => data.password === data.confirmPassword, {
      message: 'Passwords do not match.',
      path: ['confirmPassword'],
    }),
  query: z.any().optional(),
  params: z.any().optional(),
});

const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
  }),
  query: z.any().optional(),
  params: z.any().optional(),
});

const listSessionsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(10),
  }),
  body: z.any().optional(),
  params: z.any().optional(),
});

module.exports = { loginSchema, signupSchema, changePasswordSchema, listSessionsSchema };
