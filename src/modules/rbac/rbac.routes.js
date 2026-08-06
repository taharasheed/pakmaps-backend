const router = require('express').Router();
const { authMiddleware } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');
const validate = require('../../middleware/validate');
const {
  createRoleSchema,
  updateRoleSchema,
  createUserSchema,
  updateUserSchema,
  resetUserPasswordSchema,
  idParam,
} = require('./rbac.validation');
const { z } = require('zod');
const rolesController = require('./roles.controller');
const usersController = require('./users.controller');
const pagesController = require('./pages.controller');

router.use(authMiddleware);

const idOnly = z.object({ body: z.any().optional(), query: z.any().optional(), params: idParam });

router.get('/pages', requirePermission('roles', 'view'), pagesController.listPages);

router.get('/roles', requirePermission('roles', 'view'), rolesController.listRoles);
router.get('/roles/:id', requirePermission('roles', 'view'), validate(idOnly), rolesController.getRole);
router.post('/roles', requirePermission('roles', 'add'), validate(createRoleSchema), rolesController.createRole);
router.patch('/roles/:id', requirePermission('roles', 'edit'), validate(updateRoleSchema), rolesController.updateRole);
router.delete('/roles/:id', requirePermission('roles', 'delete'), validate(idOnly), rolesController.deleteRole);

router.get('/users', requirePermission('users', 'view'), usersController.listUsers);
router.get('/users/:id', requirePermission('users', 'view'), validate(idOnly), usersController.getUser);
router.post('/users', requirePermission('users', 'add'), validate(createUserSchema), usersController.createUser);
router.patch('/users/:id', requirePermission('users', 'edit'), validate(updateUserSchema), usersController.updateUser);
router.patch(
  '/users/:id/password',
  requirePermission('users', 'edit'),
  validate(resetUserPasswordSchema),
  usersController.resetUserPassword
);
router.delete('/users/:id', requirePermission('users', 'delete'), validate(idOnly), usersController.deleteUser);

module.exports = router;
