module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('api_usage_daily', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      service_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'api_services', key: 'id' },
        onDelete: 'CASCADE',
      },
      date: { type: Sequelize.DATEONLY, allowNull: false },
      total_calls: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
      success_calls: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
      error_calls: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
      cache_hits: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
      avg_latency_ms: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 0 },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('api_usage_daily', ['service_id', 'date'], { unique: true, name: 'api_usage_daily_service_date_unique' });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('api_usage_daily');
  },
};
