module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('api_services', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      slug: { type: Sequelize.STRING(60), allowNull: false, unique: true },
      name: { type: Sequelize.STRING(150), allowNull: false },
      handler_key: { type: Sequelize.STRING(60), allowNull: false },
      base_url: { type: Sequelize.STRING(500), allowNull: false, defaultValue: '' },
      is_enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      health_check_path: { type: Sequelize.STRING(300), allowNull: true },
      rate_limit_override: { type: Sequelize.INTEGER, allowNull: true },
      cache_ttl_seconds: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      cacheable: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      concurrency_limit: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 50 },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('api_services');
  },
};
