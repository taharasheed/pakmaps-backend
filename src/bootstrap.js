const bcrypt = require('bcrypt');
const env = require('./config/env');
const logger = require('./config/logger');
const { User, Role } = require('./db/models');

// Creates the very first admin account from env vars, but only if the users
// table is completely empty - safe to run on every boot.
async function ensureDefaultAdmin() {
  const userCount = await User.count();
  if (userCount > 0) return;

  const superAdminRole = await Role.findOne({ where: { name: 'Super Admin' } });
  if (!superAdminRole) {
    logger.warn('Super Admin role not found - run database seeders before starting the server.');
    return;
  }

  const passwordHash = await bcrypt.hash(env.DEFAULT_ADMIN_PASSWORD, env.BCRYPT_SALT_ROUNDS);
  await User.create({
    name: env.DEFAULT_ADMIN_NAME,
    email: env.DEFAULT_ADMIN_EMAIL,
    passwordHash,
    roleId: superAdminRole.id,
  });

  logger.warn(
    `Created default admin account (${env.DEFAULT_ADMIN_EMAIL}). Log in and change the password immediately.`
  );
}

module.exports = { ensureDefaultAdmin };
