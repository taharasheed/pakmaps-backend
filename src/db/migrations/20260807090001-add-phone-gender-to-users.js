module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'phone', { type: Sequelize.STRING(30), allowNull: true, unique: true });
    await queryInterface.addColumn('users', 'gender', { type: Sequelize.STRING(30), allowNull: true });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('users', 'phone');
    await queryInterface.removeColumn('users', 'gender');
  },
};
