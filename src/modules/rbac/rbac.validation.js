const { z } = require('zod');

const idParam = z.object({ id: z.string().uuid() });

const createRoleSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100),
    description: z.string().max(500).optional().nullable(),
    canAccessMobileApp: z.boolean().default(false),
    permissionIds: z.array(z.string().uuid()).default([]),
  }),
  query: z.any().optional(),
  params: z.any().optional(),
});

const updateRoleSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100).optional(),
    description: z.string().max(500).optional().nullable(),
    canAccessMobileApp: z.boolean().optional(),
    permissionIds: z.array(z.string().uuid()).optional(),
  }),
  query: z.any().optional(),
  params: idParam,
});

const createUserSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(150),
    email: z.string().email(),
    password: z.string().min(8),
    roleId: z.string().uuid(),
  }),
  query: z.any().optional(),
  params: z.any().optional(),
});

const updateUserSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(150).optional(),
    email: z.string().email().optional(),
    roleId: z.string().uuid().optional(),
    isActive: z.boolean().optional(),
  }),
  query: z.any().optional(),
  params: idParam,
});

const resetUserPasswordSchema = z.object({
  body: z.object({ newPassword: z.string().min(8) }),
  query: z.any().optional(),
  params: idParam,
});

module.exports = {
  idParam,
  createRoleSchema,
  updateRoleSchema,
  createUserSchema,
  updateUserSchema,
  resetUserPasswordSchema,
};
