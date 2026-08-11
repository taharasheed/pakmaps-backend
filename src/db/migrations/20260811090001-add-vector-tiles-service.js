const { v4: uuidv4 } = require('uuid');

// A separate api_services row (not just a new adapter reusing the existing
// 'tiles' row) so vector/3D tiles get their own independent enable/disable
// toggle and rate limit in the admin panel - vector rendering is heavier
// than serving a flat PNG, and an admin may want to turn it off without
// touching the existing raster tiles every app build already depends on.
module.exports = {
  up: async (queryInterface) => {
    const now = new Date();
    await queryInterface.bulkInsert('api_services', [
      {
        id: uuidv4(),
        slug: 'tiles-vector',
        name: 'Map Tiles (Vector/3D)',
        handler_key: 'tilesVector',
        base_url: process.env.TILE_SERVER_BASE_URL || '',
        is_enabled: true,
        health_check_path: null,
        rate_limit_override: 600,
        cache_ttl_seconds: 21600,
        cacheable: true,
        concurrency_limit: 100,
        created_at: now,
        updated_at: now,
      },
    ]);
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete('api_services', { slug: 'tiles-vector' }, {});
  },
};
