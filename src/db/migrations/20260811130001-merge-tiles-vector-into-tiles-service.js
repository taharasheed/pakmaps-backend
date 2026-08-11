// The vector (dark/bright) and raster (satellite) tile paths now share the
// single 'tiles' service row for config, rate limiting, and audit/activity
// log identity (see gateway.js's adapterKeyOverride and tiles.controller.js)
// - the separate 'tiles-vector' row is no longer read anywhere, so it's
// removed rather than left behind as a dead, confusing duplicate in the
// admin's API Services list.
const { v4: uuidv4 } = require('uuid');

module.exports = {
  up: async (queryInterface) => {
    await queryInterface.bulkDelete('api_services', { slug: 'tiles-vector' }, {});
  },

  down: async (queryInterface) => {
    const now = new Date();
    await queryInterface.bulkInsert('api_services', [
      {
        id: uuidv4(),
        slug: 'tiles-vector',
        name: 'Tiles',
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
};
