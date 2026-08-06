module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('sessions', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      client_type: { type: Sequelize.ENUM('web', 'mobile'), allowNull: false, defaultValue: 'web' },
      device_info: { type: Sequelize.JSONB, allowNull: true },
      ip_address: { type: Sequelize.STRING(64), allowNull: true },
      location: { type: Sequelize.STRING(200), allowNull: true },
      last_active: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('sessions', ['user_id']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('sessions');
  },
};
