const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

// Placeholder credentials, deliberately generic (not tied to any real client
// domain) - change the password immediately after first login.
const ADMIN_NAME = 'Super Admin';
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'ChangeMe123!';
const SALT_ROUNDS = 12;

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const [role] = await queryInterface.sequelize.query(
      `SELECT id FROM roles WHERE name = 'Super Admin' LIMIT 1`,
      { type: Sequelize.QueryTypes.SELECT }
    );
    if (!role) {
      throw new Error('Super Admin role not found - run the pages/permissions seeder first.');
    }

    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS);
    const now = new Date();

    await queryInterface.bulkInsert('users', [
      {
        id: uuidv4(),
        name: ADMIN_NAME,
        email: ADMIN_EMAIL,
        password_hash: passwordHash,
        role_id: role.id,
        is_active: true,
        created_at: now,
        updated_at: now,
      },
    ]);
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete('users', { email: ADMIN_EMAIL }, {});
  },
};
