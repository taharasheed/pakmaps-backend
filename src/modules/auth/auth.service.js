const bcrypt = require('bcrypt');
const { User, Role, Permission, Page, Session } = require('../../db/models');
const AppError = require('../../utils/AppError');
const { signToken } = require('../../utils/jwt');
const { getClientIp, getDeviceInfo } = require('../../utils/requestMeta');

const roleIncludeWithPermissions = {
  model: Role,
  as: 'role',
  include: [{ model: Permission, as: 'permissions', include: [{ model: Page, as: 'page' }] }],
};

async function findUserWithRole(email) {
  return User.scope('withPassword').findOne({ where: { email }, include: [roleIncludeWithPermissions] });
}

async function authenticateCredentials(email, password, clientType) {
  const user = await findUserWithRole(email);
  if (!user) throw new AppError('Invalid email or password.', 401);
  if (!user.isActive) throw new AppError('This account has been disabled.', 403);

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new AppError('Invalid email or password.', 401);

  if (clientType === 'mobile' && !user.role.canAccessMobileApp) {
    throw new AppError('This account does not have mobile app access.', 403);
  }

  return user;
}

async function createSessionAndToken(user, clientType, req) {
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * (clientType === 'mobile' ? 30 : 7));

  const session = await Session.create({
    userId: user.id,
    clientType,
    deviceInfo: getDeviceInfo(req),
    ipAddress: getClientIp(req),
    lastActive: new Date(),
    expiresAt,
  });

  const token = signToken(
    { sub: user.id, roleId: user.roleId, clientType, sessionId: session.id },
    clientType
  );

  return { session, token };
}

function serializeUser(user) {
  const plain = user.toJSON ? user.toJSON() : user;
  const permissions = (plain.role?.permissions || []).map((p) => ({ page: p.page?.key, action: p.action }));
  return {
    id: plain.id,
    name: plain.name,
    email: plain.email,
    isActive: plain.isActive,
    lastLoginAt: plain.lastLoginAt,
    role: plain.role
      ? {
          id: plain.role.id,
          name: plain.role.name,
          canAccessMobileApp: plain.role.canAccessMobileApp,
        }
      : null,
    permissions,
  };
}

module.exports = {
  findUserWithRole,
  authenticateCredentials,
  createSessionAndToken,
  serializeUser,
  roleIncludeWithPermissions,
};
