// Shortened from "Tiles - Buildings Overlay" - the "Tiles - " prefix just
// made it the widest label in the admin panel's services list/chart for no
// real benefit, since it's already visually grouped with the other tile
// services there.
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.bulkUpdate('api_services', { name: 'Buildings Overlay' }, { slug: 'tiles-buildings' });
  },

  down: async (queryInterface) => {
    await queryInterface.bulkUpdate('api_services', { name: 'Tiles - Buildings Overlay' }, { slug: 'tiles-buildings' });
  },
};
