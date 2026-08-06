module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('permissions', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      page_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'pages', key: 'id' },
        onDelete: 'CASCADE',
      },
      action: { type: Sequelize.ENUM('view', 'add', 'edit', 'delete'), allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('permissions', ['page_id', 'action'], { unique: true, name: 'permissions_page_action_unique' });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('permissions');
  },
};
