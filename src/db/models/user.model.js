module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define(
    'User',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING(150), allowNull: false },
      email: { type: DataTypes.STRING(200), allowNull: false, unique: true, validate: { isEmail: true } },
      passwordHash: { type: DataTypes.STRING(200), allowNull: false },
      roleId: { type: DataTypes.UUID, allowNull: false },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      lastLoginAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'users',
      underscored: true,
      timestamps: true,
      defaultScope: {
        attributes: { exclude: ['passwordHash'] },
      },
      scopes: {
        withPassword: { attributes: {} },
      },
    }
  );

  User.associate = (models) => {
    User.belongsTo(models.Role, { foreignKey: 'roleId', as: 'role' });
    User.hasMany(models.Session, { foreignKey: 'userId', as: 'sessions' });
  };

  return User;
};
