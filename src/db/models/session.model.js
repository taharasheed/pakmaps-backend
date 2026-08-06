module.exports = (sequelize, DataTypes) => {
  const Session = sequelize.define(
    'Session',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      userId: { type: DataTypes.UUID, allowNull: false },
      clientType: { type: DataTypes.ENUM('web', 'mobile'), allowNull: false, defaultValue: 'web' },
      deviceInfo: { type: DataTypes.JSONB, allowNull: true },
      ipAddress: { type: DataTypes.STRING(64), allowNull: true },
      location: { type: DataTypes.STRING(200), allowNull: true },
      lastActive: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      tableName: 'sessions',
      underscored: true,
      timestamps: true,
    }
  );

  Session.associate = (models) => {
    Session.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
  };

  return Session;
};
