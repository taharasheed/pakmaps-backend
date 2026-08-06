module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('notifications', 'app_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'notification_apps', key: 'id' },
      onDelete: 'CASCADE',
    });
    await queryInterface.addColumn('notifications', 'external_recipient_id', {
      type: Sequelize.STRING(150),
      allowNull: true,
    });
    await queryInterface.addIndex('notifications', ['app_id', 'external_recipient_id', 'is_read']);
  },
  down: async (queryInterface) => {
    await queryInterface.removeIndex('notifications', ['app_id', 'external_recipient_id', 'is_read']);
    await queryInterface.removeColumn('notifications', 'external_recipient_id');
    await queryInterface.removeColumn('notifications', 'app_id');
  },
};
