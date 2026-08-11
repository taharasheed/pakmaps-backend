// Reverts 20260811130001/20260811130002 - merging vector (dark/bright) and
// raster (satellite) tiles under one 'tiles' service row changed the Redis
// cache key prefix for vector tiles (proxycache:tiles-vector:... ->
// proxycache:tiles:...), which orphaned every already-cached vector tile
// and forced a fresh upstream fetch for each one - a real, felt slowdown
// right after deploy. Restoring the two-service split this migration
// reverses undoes that cache-key change too, since cache keys are built
// from the service slug.
const { v4: uuidv4 } = require('uuid');

module.exports = {
  up: async (queryInterface) => {
    await queryInterface.bulkUpdate('api_services', { name: 'Map Tiles (Satellite)' }, { slug: 'tiles' });

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

  down: async (queryInterface) => {
    await queryInterface.bulkDelete('api_services', { slug: 'tiles-vector' }, {});
    await queryInterface.bulkUpdate('api_services', { name: 'Tiles' }, { slug: 'tiles' });
  },
};
