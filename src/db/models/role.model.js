module.exports = (sequelize, DataTypes) => {
  const Role = sequelize.define(
    'Role',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      description: { type: DataTypes.STRING(500), allowNull: true },
      canAccessMobileApp: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      isSystem: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    {
      tableName: 'roles',
      underscored: true,
      timestamps: true,
    }
  );

  Role.associate = (models) => {
    Role.hasMany(models.User, { foreignKey: 'roleId', as: 'users' });
    Role.belongsToMany(models.Permission, {
      through: models.RolePermission,
      foreignKey: 'roleId',
      otherKey: 'permissionId',
      as: 'permissions',
    });
  };

  return Role;
};
