const { v4: uuidv4 } = require('uuid');

module.exports = {
  up: async (queryInterface) => {
    const now = new Date();
    await queryInterface.bulkInsert('roles', [
      {
        id: uuidv4(),
        name: 'Mobile User',
        description: 'Self-registered app user. No admin panel access by default - grant a different role to change that.',
        can_access_mobile_app: true,
        is_system: true,
        created_at: now,
        updated_at: now,
      },
    ]);
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete('roles', { name: 'Mobile User' }, {});
  },
};
