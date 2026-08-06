module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('notifications', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      recipient_user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      type: { type: Sequelize.STRING(60), allowNull: false },
      title: { type: Sequelize.STRING(200), allowNull: false },
      message: { type: Sequelize.STRING(1000), allowNull: false },
      meta: { type: Sequelize.JSONB, allowNull: true },
      is_read: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('notifications', ['recipient_user_id', 'is_read']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('notifications');
  },
};
