// Companion to 20260811120001 - now that both tile services show up in the
// admin API Services list ('Tiles' for the vector dark/bright data), the
// original raster service (now only actually used for satellite) needs a
// name that's clearly distinct at a glance, not just "Map Tiles" vs "Tiles".
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.bulkUpdate('api_services', { name: 'Map Tiles (Satellite)' }, { slug: 'tiles' });
  },

  down: async (queryInterface) => {
    await queryInterface.bulkUpdate('api_services', { name: 'Map Tiles' }, { slug: 'tiles' });
  },
};
