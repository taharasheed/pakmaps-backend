module.exports = {
  up: async (queryInterface, Sequelize) => {
    const latLon = { lat: Sequelize.DECIMAL(9, 6), lon: Sequelize.DECIMAL(9, 6) };
    for (const table of ['sessions', 'audit_logs', 'api_activity_logs']) {
      await queryInterface.addColumn(table, 'lat', { type: latLon.lat, allowNull: true });
      await queryInterface.addColumn(table, 'lon', { type: latLon.lon, allowNull: true });
    }
  },
  down: async (queryInterface) => {
    for (const table of ['sessions', 'audit_logs', 'api_activity_logs']) {
      await queryInterface.removeColumn(table, 'lat');
      await queryInterface.removeColumn(table, 'lon');
    }
  },
};
