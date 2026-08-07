const { v4: uuidv4 } = require('uuid');

const TILE_BASE = process.env.TILE_SERVER_BASE_URL || '';
const GEOCODER_BASE = process.env.GEOCODER_BASE_URL || '';
const ROUTING_BASE = process.env.ROUTING_BASE_URL || '';

const SERVICES = [
  { slug: 'tiles', name: 'Map Tiles', handlerKey: 'tiles', baseUrl: TILE_BASE, cacheable: true, cacheTtlSeconds: 21600, concurrencyLimit: 100 },
  { slug: 'autocomplete', name: 'Autocomplete', handlerKey: 'autocomplete', baseUrl: GEOCODER_BASE, cacheable: true, cacheTtlSeconds: 300, concurrencyLimit: 60 },
  { slug: 'search', name: 'Search', handlerKey: 'search', baseUrl: GEOCODER_BASE, cacheable: true, cacheTtlSeconds: 300, concurrencyLimit: 60 },
  { slug: 'reverse_geocoding', name: 'Reverse Geocoding', handlerKey: 'reverseGeocoding', baseUrl: GEOCODER_BASE, cacheable: true, cacheTtlSeconds: 300, concurrencyLimit: 60 },
  { slug: 'routing', name: 'Routing', handlerKey: 'routing', baseUrl: ROUTING_BASE, cacheable: true, cacheTtlSeconds: 60, concurrencyLimit: 40 },
];

module.exports = {
  up: async (queryInterface) => {
    const now = new Date();
    const rows = SERVICES.map((s) => ({
      id: uuidv4(),
      slug: s.slug,
      name: s.name,
      handler_key: s.handlerKey,
      base_url: s.baseUrl,
      is_enabled: true,
      health_check_path: null,
      rate_limit_override: null,
      cache_ttl_seconds: s.cacheTtlSeconds,
      cacheable: s.cacheable,
      concurrency_limit: s.concurrencyLimit,
      created_at: now,
      updated_at: now,
    }));
    await queryInterface.bulkInsert('api_services', rows);
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete('api_services', null, {});
  },
};
