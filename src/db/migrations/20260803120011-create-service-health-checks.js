module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('service_health_checks', {
      id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true },
      service_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'api_services', key: 'id' },
        onDelete: 'CASCADE',
      },
      status: { type: Sequelize.ENUM('up', 'down'), allowNull: false },
      latency_ms: { type: Sequelize.INTEGER, allowNull: true },
      source: { type: Sequelize.ENUM('active', 'passive'), allowNull: false, defaultValue: 'active' },
      error_message: { type: Sequelize.STRING(500), allowNull: true },
      checked_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('service_health_checks', ['service_id', 'checked_at']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('service_health_checks');
  },
};
