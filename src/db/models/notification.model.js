module.exports = (sequelize, DataTypes) => {
  const Notification = sequelize.define(
    'Notification',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      // A notification is either internal (recipientUserId, created by Pak Maps
      // itself e.g. health-check transitions) or external (appId + externalRecipientId,
      // created by an integrated app for one of ITS OWN users, who Pak Maps never
      // otherwise sees). Enforced in the service layer, not a DB constraint.
      recipientUserId: { type: DataTypes.UUID, allowNull: true },
      appId: { type: DataTypes.UUID, allowNull: true },
      externalRecipientId: { type: DataTypes.STRING(150), allowNull: true },
      type: { type: DataTypes.STRING(60), allowNull: false },
      title: { type: DataTypes.STRING(200), allowNull: false },
      message: { type: DataTypes.STRING(1000), allowNull: false },
      meta: { type: DataTypes.JSONB, allowNull: true },
      isRead: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    {
      tableName: 'notifications',
      underscored: true,
      timestamps: true,
      indexes: [{ fields: ['recipient_user_id', 'is_read'] }, { fields: ['app_id', 'external_recipient_id', 'is_read'] }],
    }
  );

  Notification.associate = (models) => {
    Notification.belongsTo(models.NotificationApp, { foreignKey: 'appId', as: 'app' });
  };

  return Notification;
};
