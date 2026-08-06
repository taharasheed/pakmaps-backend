const { z } = require('zod');

const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1),
    clientType: z.enum(['web', 'mobile']).default('web'),
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

module.exports = { loginSchema, changePasswordSchema };
