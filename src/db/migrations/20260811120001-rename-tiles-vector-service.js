// The '3D' framing no longer matches reality - dark/bright are served as
// vector data straight from the main /tiles endpoint now, not a separate
// opt-in endpoint, so the admin-facing name shouldn't call out "Vector/3D"
// as if it's a distinct feature. This is a plain rename, not a new service -
// the slug ('tiles-vector') stays the same since it's still a real, distinct
// upstream capability from the 'tiles' (raster/satellite) service.
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.bulkUpdate('api_services', { name: 'Tiles' }, { slug: 'tiles-vector' });
  },

  down: async (queryInterface) => {
    await queryInterface.bulkUpdate('api_services', { name: 'Map Tiles (Vector/3D)' }, { slug: 'tiles-vector' });
  },
};
