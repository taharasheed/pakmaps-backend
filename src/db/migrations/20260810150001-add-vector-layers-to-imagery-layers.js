module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('imagery_layers', 'vector_layers', {
      type: Sequelize.JSONB,
      allowNull: true,
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('imagery_layers', 'vector_layers');
  },
};
