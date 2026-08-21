const { z } = require('zod');

// Optional device context a mobile client can attach at login - all optional
// so older app builds that don't send these yet keep working unchanged.
const deviceMetaSchema = z.object({
  deviceId: z.string().max(200).optional(),
  platform: z.string().max(50).optional(),
  model: z.string().max(100).optional(),
  brand: z.string().max(100).optional(),
  appVersion: z.string().max(50).optional(),
  // R1 Push build context (PAKMAPS_R1_PUSH_BACKEND_IMPLEMENTATION_GUIDE.md).
  // pushProvider must be exactly 'custom' AND env.PUSH_NOTIFICATION_PROVIDER
  // must independently agree (see auth.service.js) before any R1 credential
  // is minted - never trusted as authorization on its own, only used to
  // pick which registration path to take. appInstallationId/packageName are
  // never trusted as authorization either; the gateway independently
  // re-validates both when the daemon actually connects.
  pushProvider: z.string().max(20).optional(),
  appInstallationId: z.string().min(8).max(200).optional(),
  packageName: z.string().max(255).optional(),
});

// R1's own daemon (RegistrationSecurity.verify()) requires a non-blank
// packageName before it will even accept a registration - so a
// pushProvider:'custom' request missing packageName can never actually
// result in a working subscription. Failing loudly here, at the request
// boundary, is much easier to debug for whoever is integrating the mobile
// build than the alternative (auth.service.js's mintSubscription call
// failing server-side against notification-hub's own required-field check,
// silently degrading to r1Push: null with no signal beyond a log line).
function requirePackageNameForR1Push(data, ctx) {
  if (data.pushProvider === 'custom' && !data.packageName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'packageName is required when pushProvider is "custom".',
      path: ['packageName'],
    });
  }
}

const loginSchema = z.object({
  body: z
    .object({
      email: z.string().email(),
      password: z.string().min(1),
      clientType: z.enum(['web', 'mobile']).default('web'),
    })
    .merge(deviceMetaSchema)
    .superRefine(requirePackageNameForR1Push),
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
    })
    .superRefine(requirePackageNameForR1Push),
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

const refreshSchema = z.object({
  // Web doesn't send this - the refresh token comes from its own path-scoped
  // cookie instead (see auth.controller.js), and sends no body/Content-Type
  // at all on this call, so req.body arrives as undefined, not {} - body
  // itself has to tolerate being absent, not just the field inside it.
  // Mobile sends a real body with refreshToken set.
  body: z
    .object({
      refreshToken: z.string().min(1).optional(),
    })
    .optional()
    .default({}),
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

module.exports = { loginSchema, signupSchema, changePasswordSchema, refreshSchema, listSessionsSchema };
