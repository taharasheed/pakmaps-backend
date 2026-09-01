const { v4: uuidv4 } = require('uuid');

// Lets an imagery_layers row point at an existing tileserver-gl style
// ('satellite' / 'satellite_2', already served independently via
// /proxy/tiles/:style for the app's base-map switcher) instead of an
// uploaded .mbtiles file - so the same enable/disable + priority controls
// on the Imagery Layers panel can also govern these two, without touching
// how the base-map switcher itself works.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('imagery_layers', 'source_type', {
      type: Sequelize.STRING(10),
      allowNull: false,
      defaultValue: 'upload',
    });
    await queryInterface.addColumn('imagery_layers', 'proxy_style', {
      type: Sequelize.STRING(50),
      allowNull: true,
    });

    // Only uploaded layers have a file on disk.
    await queryInterface.changeColumn('imagery_layers', 'stored_filename', {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
    await queryInterface.changeColumn('imagery_layers', 'original_filename', {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
    await queryInterface.changeColumn('imagery_layers', 'file_size_bytes', {
      type: Sequelize.BIGINT,
      allowNull: true,
    });

    const [[{ max_priority: maxPriority }]] = await queryInterface.sequelize.query(
      'SELECT MAX(priority) AS max_priority FROM imagery_layers'
    );
    const basePriority = Number.isFinite(Number(maxPriority)) ? Number(maxPriority) + 1 : 0;

    const now = new Date();
    await queryInterface.bulkInsert('imagery_layers', [
      {
        id: uuidv4(),
        name: 'Pakistan Satellite (10m)',
        slug: `satellite-national-${Date.now().toString(36)}`,
        description: 'Nationwide satellite imagery, served live from the tileserver - not a file upload, so only enable/disable and priority apply here.',
        source_type: 'proxy',
        proxy_style: 'satellite',
        stored_filename: null,
        original_filename: null,
        file_size_bytes: null,
        tile_format: 'png',
        min_zoom: 5,
        max_zoom: 13,
        bounds_west: 60.87,
        bounds_south: 23.63,
        bounds_east: 77.84,
        bounds_north: 37.13,
        is_enabled: false,
        priority: basePriority,
        created_at: now,
        updated_at: now,
      },
      {
        id: uuidv4(),
        name: 'Islamabad/Rawalpindi Satellite (HD)',
        slug: `satellite-isb-rwp-${Date.now().toString(36)}`,
        description: 'High-resolution aerial imagery for Islamabad/Rawalpindi, served live from the tileserver - not a file upload, so only enable/disable and priority apply here.',
        source_type: 'proxy',
        proxy_style: 'satellite_2',
        stored_filename: null,
        original_filename: null,
        file_size_bytes: null,
        tile_format: 'png',
        min_zoom: 8,
        max_zoom: 18,
        bounds_west: 72.75,
        bounds_south: 33.35,
        bounds_east: 73.35,
        bounds_north: 33.85,
        is_enabled: false,
        priority: basePriority + 1,
        created_at: now,
        updated_at: now,
      },
    ]);
  },
  down: async (queryInterface) => {
    await queryInterface.bulkDelete('imagery_layers', { source_type: 'proxy' });
    await queryInterface.changeColumn('imagery_layers', 'stored_filename', {
      type: 'VARCHAR(255)',
      allowNull: false,
    });
    await queryInterface.changeColumn('imagery_layers', 'original_filename', {
      type: 'VARCHAR(255)',
      allowNull: false,
    });
    await queryInterface.changeColumn('imagery_layers', 'file_size_bytes', {
      type: 'BIGINT',
      allowNull: false,
    });
    await queryInterface.removeColumn('imagery_layers', 'proxy_style');
    await queryInterface.removeColumn('imagery_layers', 'source_type');
  },
};
