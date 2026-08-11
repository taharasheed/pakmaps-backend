// Supersedes the 'Map Tiles (Satellite)' rename from migration
// 20260811120002 - now that vector (dark/bright) and raster (satellite)
// share this single service row (see 20260811130001), "(Satellite)" is no
// longer accurate; it covers all three styles.
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.bulkUpdate('api_services', { name: 'Tiles' }, { slug: 'tiles' });
  },

  down: async (queryInterface) => {
    await queryInterface.bulkUpdate('api_services', { name: 'Map Tiles (Satellite)' }, { slug: 'tiles' });
  },
};
