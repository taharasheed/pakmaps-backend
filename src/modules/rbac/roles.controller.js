const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/apiResponse');
const AppError = require('../../utils/AppError');
const { Role, Permission, Page, User, sequelize } = require('../../db/models');
const { recordAudit } = require('../audit/audit.service');

const roleInclude = [
  { model: Permission, as: 'permissions', include: [{ model: Page, as: 'page' }], through: { attributes: [] } },
];

const listRoles = asyncHandler(async (req, res) => {
  const { page, pageSize } = req.query;
  const { rows, count } = await Role.findAndCountAll({
    include: [...roleInclude, { model: User, as: 'users', attributes: ['id'] }],
    order: [['createdAt', 'ASC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    // permissions/users are joined many-rows-per-role - without this the
    // count (and the subquery Sequelize builds for limit/offset) would be
    // inflated by however many permissions/users each role has.
    distinct: true,
  });
  const data = rows.map((r) => {
    const plain = r.toJSON();
    return { ...plain, userCount: plain.users?.length || 0, users: undefined };
  });
  return ok(res, { rows: data, page, pageSize, total: count, totalPages: Math.ceil(count / pageSize) });
});

const getRole = asyncHandler(async (req, res) => {
  const role = await Role.findByPk(req.params.id, { include: roleInclude });
  if (!role) throw new AppError('Role not found.', 404);
  return ok(res, role);
});

const createRole = asyncHandler(async (req, res) => {
  const { name, description, canAccessMobileApp, permissionIds } = req.body;

  const result = await sequelize.transaction(async (t) => {
    const role = await Role.create({ name, description, canAccessMobileApp }, { transaction: t });
    if (permissionIds.length) {
      await role.setPermissions(permissionIds, { transaction: t });
    }
    return role;
  });

  const role = await Role.findByPk(result.id, { include: roleInclude });
  req.auditMeta = { entityId: role.id, changes: req.body };
  await recordAudit({ req, user: req.user, action: 'create', entityType: 'role', entityId: role.id, changes: req.body });
  return created(res, role, 'Role created.');
});

const updateRole = asyncHandler(async (req, res) => {
  const role = await Role.findByPk(req.params.id);
  if (!role) throw new AppError('Role not found.', 404);
  if (role.isSystem && req.body.canAccessMobileApp === false) {
    throw new AppError('The Super Admin role must always keep mobile app access enabled.', 400);
  }

  const { permissionIds, ...fields } = req.body;

  await sequelize.transaction(async (t) => {
    await role.update(fields, { transaction: t });
    if (permissionIds && !role.isSystem) {
      await role.setPermissions(permissionIds, { transaction: t });
    }
  });

  const updated = await Role.findByPk(role.id, { include: roleInclude });
  await recordAudit({ req, user: req.user, action: 'update', entityType: 'role', entityId: role.id, changes: req.body });
  return ok(res, updated, 'Role updated.');
});

const deleteRole = asyncHandler(async (req, res) => {
  const role = await Role.findByPk(req.params.id, { include: [{ model: User, as: 'users', attributes: ['id'] }] });
  if (!role) throw new AppError('Role not found.', 404);
  if (role.isSystem) throw new AppError('System roles cannot be deleted.', 400);
  if (role.users?.length) throw new AppError('Cannot delete a role that still has users assigned to it.', 400);

  await role.destroy();
  await recordAudit({ req, user: req.user, action: 'delete', entityType: 'role', entityId: req.params.id });
  return ok(res, null, 'Role deleted.');
});

module.exports = { listRoles, getRole, createRole, updateRole, deleteRole };
