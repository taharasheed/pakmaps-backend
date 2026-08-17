const bcrypt = require('bcrypt');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/apiResponse');
const AppError = require('../../utils/AppError');
const env = require('../../config/env');
const { User, Role } = require('../../db/models');
const { recordAudit } = require('../audit/audit.service');

const listUsers = asyncHandler(async (req, res) => {
  const { page, pageSize } = req.query;
  const { rows, count } = await User.findAndCountAll({
    include: [{ model: Role, as: 'role', attributes: ['id', 'name', 'canAccessMobileApp'] }],
    order: [['createdAt', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  return ok(res, { rows, page, pageSize, total: count, totalPages: Math.ceil(count / pageSize) });
});

const getUser = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id, { include: [{ model: Role, as: 'role' }] });
  if (!user) throw new AppError('User not found.', 404);
  return ok(res, user);
});

const createUser = asyncHandler(async (req, res) => {
  const { name, email, phone, gender, password, roleId } = req.body;

  const existing = await User.findOne({ where: { email } });
  if (existing) throw new AppError('A user with this email already exists.', 409);

  if (phone) {
    const existingPhone = await User.findOne({ where: { phone } });
    if (existingPhone) throw new AppError('A user with this phone number already exists.', 409);
  }

  const role = await Role.findByPk(roleId);
  if (!role) throw new AppError('Selected role does not exist.', 400);

  const passwordHash = await bcrypt.hash(password, env.BCRYPT_SALT_ROUNDS);
  const user = await User.create({ name, email, phone, gender, passwordHash, roleId });

  await recordAudit({ req, user: req.user, action: 'create', entityType: 'user', entityId: user.id, changes: { name, email, phone, gender, roleId } });
  return created(res, user, 'User created.');
});

const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) throw new AppError('User not found.', 404);

  if (req.body.email && req.body.email !== user.email) {
    const existing = await User.findOne({ where: { email: req.body.email } });
    if (existing) throw new AppError('A user with this email already exists.', 409);
  }

  if (req.body.phone && req.body.phone !== user.phone) {
    const existingPhone = await User.findOne({ where: { phone: req.body.phone } });
    if (existingPhone) throw new AppError('A user with this phone number already exists.', 409);
  }

  if (user.id === req.user.id && req.body.isActive === false) {
    throw new AppError('You cannot deactivate your own account.', 400);
  }

  await user.update(req.body);
  await recordAudit({ req, user: req.user, action: 'update', entityType: 'user', entityId: user.id, changes: req.body });
  return ok(res, user, 'User updated.');
});

const resetUserPassword = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) throw new AppError('User not found.', 404);

  const passwordHash = await bcrypt.hash(req.body.newPassword, env.BCRYPT_SALT_ROUNDS);
  await user.update({ passwordHash });

  await recordAudit({ req, user: req.user, action: 'reset_password', entityType: 'user', entityId: user.id });
  return ok(res, null, "User's password has been reset.");
});

const deleteUser = asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) throw new AppError('You cannot delete your own account.', 400);

  const user = await User.findByPk(req.params.id);
  if (!user) throw new AppError('User not found.', 404);

  await user.destroy();
  await recordAudit({ req, user: req.user, action: 'delete', entityType: 'user', entityId: req.params.id });
  return ok(res, null, 'User deleted.');
});

module.exports = { listUsers, getUser, createUser, updateUser, resetUserPassword, deleteUser };
