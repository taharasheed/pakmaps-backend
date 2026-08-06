module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('audit_logs', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      actor_user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      actor_name: { type: Sequelize.STRING(150), allowNull: true },
      actor_email: { type: Sequelize.STRING(200), allowNull: true },
      action: { type: Sequelize.STRING(50), allowNull: false },
      entity_type: { type: Sequelize.STRING(80), allowNull: true },
      entity_id: { type: Sequelize.STRING(100), allowNull: true },
      source: { type: Sequelize.ENUM('web', 'mobile'), allowNull: false, defaultValue: 'web' },
      ip_address: { type: Sequelize.STRING(64), allowNull: true },
      user_agent: { type: Sequelize.STRING(500), allowNull: true },
      changes: { type: Sequelize.JSONB, allowNull: true },
      status_code: { type: Sequelize.INTEGER, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('audit_logs', ['actor_user_id']);
    await queryInterface.addIndex('audit_logs', ['action']);
    await queryInterface.addIndex('audit_logs', ['created_at']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('audit_logs');
  },
};
