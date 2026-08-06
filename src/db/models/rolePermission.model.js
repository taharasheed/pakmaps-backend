module.exports = (sequelize, DataTypes) => {
  const RolePermission = sequelize.define(
    'RolePermission',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      roleId: { type: DataTypes.UUID, allowNull: false },
      permissionId: { type: DataTypes.UUID, allowNull: false },
    },
    {
      tableName: 'role_permissions',
      underscored: true,
      timestamps: true,
      indexes: [{ unique: true, fields: ['role_id', 'permission_id'] }],
    }
  );

  return RolePermission;
};
