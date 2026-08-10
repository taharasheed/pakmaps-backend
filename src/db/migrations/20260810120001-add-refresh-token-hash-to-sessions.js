module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('sessions', 'refresh_token_hash', { type: Sequelize.STRING(64), allowNull: true });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('sessions', 'refresh_token_hash');
  },
};
