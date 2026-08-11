module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('imagery_layers', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      name: { type: Sequelize.STRING(150), allowNull: false },
      slug: { type: Sequelize.STRING(80), allowNull: false, unique: true },
      description: { type: Sequelize.STRING(500), allowNull: true },
      // Stored filename on disk (generated, never the user-supplied one) -
      // see imageryLayers.controller.js for why.
      stored_filename: { type: Sequelize.STRING(255), allowNull: false },
      original_filename: { type: Sequelize.STRING(255), allowNull: false },
      file_size_bytes: { type: Sequelize.BIGINT, allowNull: false },
      tile_format: { type: Sequelize.STRING(10), allowNull: false },
      min_zoom: { type: Sequelize.INTEGER, allowNull: false },
      max_zoom: { type: Sequelize.INTEGER, allowNull: false },
      // [west, south, east, north] in degrees, as extracted from the
      // mbtiles metadata table at upload time.
      bounds_west: { type: Sequelize.DOUBLE, allowNull: true },
      bounds_south: { type: Sequelize.DOUBLE, allowNull: true },
      bounds_east: { type: Sequelize.DOUBLE, allowNull: true },
      bounds_north: { type: Sequelize.DOUBLE, allowNull: true },
      is_enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      uploaded_by: { type: Sequelize.UUID, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('imagery_layers');
  },
};
