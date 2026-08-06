const ACTIONS = ['view', 'add', 'edit', 'delete'];

module.exports = (sequelize, DataTypes) => {
  const Permission = sequelize.define(
    'Permission',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      pageId: { type: DataTypes.UUID, allowNull: false },
      action: { type: DataTypes.ENUM(...ACTIONS), allowNull: false },
    },
    {
      tableName: 'permissions',
      underscored: true,
      timestamps: true,
      indexes: [{ unique: true, fields: ['page_id', 'action'] }],
    }
  );

  Permission.ACTIONS = ACTIONS;

  Permission.associate = (models) => {
    Permission.belongsTo(models.Page, { foreignKey: 'pageId', as: 'page' });
    Permission.belongsToMany(models.Role, {
      through: models.RolePermission,
      foreignKey: 'permissionId',
      otherKey: 'roleId',
      as: 'roles',
    });
  };

  return Permission;
};
