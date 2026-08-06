module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('api_activity_logs', {
      id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true },
      user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      service_slug: { type: Sequelize.STRING(60), allowNull: false },
      source: { type: Sequelize.ENUM('web', 'mobile'), allowNull: false, defaultValue: 'mobile' },
      request_params: { type: Sequelize.JSONB, allowNull: true },
      response_summary: { type: Sequelize.JSONB, allowNull: true },
      status: { type: Sequelize.ENUM('success', 'error'), allowNull: false },
      status_code: { type: Sequelize.INTEGER, allowNull: true },
      latency_ms: { type: Sequelize.INTEGER, allowNull: true },
      cache_hit: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      ip_address: { type: Sequelize.STRING(64), allowNull: true },
      device_info: { type: Sequelize.JSONB, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('api_activity_logs', ['user_id']);
    await queryInterface.addIndex('api_activity_logs', ['service_slug']);
    await queryInterface.addIndex('api_activity_logs', ['created_at']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('api_activity_logs');
  },
};
