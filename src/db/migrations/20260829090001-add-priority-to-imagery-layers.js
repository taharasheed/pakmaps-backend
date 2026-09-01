// Priority ranks enabled layers of the same tile format against each other
// when their coverage overlaps (e.g. a 30cm city layer vs a 10m national
// layer, or two same-resolution layers shot on different dates) - resolution
// metadata alone can't settle that, so it's an explicit admin call. Higher
// number wins. Backfilled by upload order (oldest = lowest) so existing
// layers get a stable, sensible starting order.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('imagery_layers', 'priority', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.sequelize.query(`
      UPDATE imagery_layers
      SET priority = ranked.rn
      FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
        FROM imagery_layers
      ) AS ranked
      WHERE imagery_layers.id = ranked.id
    `);
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('imagery_layers', 'priority');
  },
};
