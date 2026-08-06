module.exports = (sequelize, DataTypes) => {
  const NotificationApp = sequelize.define(
    'NotificationApp',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING(150), allowNull: false },
      keyPrefix: { type: DataTypes.STRING(12), allowNull: false, unique: true },
      keyHash: { type: DataTypes.STRING(64), allowNull: false },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      createdByUserId: { type: DataTypes.UUID, allowNull: true },
      lastUsedAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'notification_apps',
      underscored: true,
      timestamps: true,
      defaultScope: { attributes: { exclude: ['keyHash'] } },
      scopes: { withKeyHash: { attributes: {} } },
    }
  );

  NotificationApp.associate = (models) => {
    NotificationApp.belongsTo(models.User, { foreignKey: 'createdByUserId', as: 'createdBy' });
    NotificationApp.hasMany(models.Notification, { foreignKey: 'appId', as: 'notifications' });
  };

  return NotificationApp;
};
