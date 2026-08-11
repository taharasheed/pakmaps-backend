// Re-applies the merge from 20260811130001/20260811130002, reverted in
// 20260811140001. The revert was a precaution while we suspected the merge
// itself caused a slowdown; the real cause turned out to be an unrelated
// bug (BullMQ never trimming completed job records - see scheduler.js
// changes in this same deploy), so the merge is safe to restore. This will
// briefly cost fresh cache misses on dark/bright tiles again (same reason
// as last time - the cache key prefix changes with the slug), which is a
// one-time, self-healing cost, not a repeat of a real problem.
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.bulkDelete('api_services', { slug: 'tiles-vector' }, {});
    await queryInterface.bulkUpdate('api_services', { name: 'Tiles' }, { slug: 'tiles' });
  },

  down: async (queryInterface) => {
    const { v4: uuidv4 } = require('uuid');
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
};
