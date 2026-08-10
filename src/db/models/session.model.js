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
      lat: { type: DataTypes.DECIMAL(9, 6), allowNull: true },
      lon: { type: DataTypes.DECIMAL(9, 6), allowNull: true },
      lastActive: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      // Sliding expiry for the refresh token below - reset to "now + REFRESH_TOKEN_TTL_DAYS"
      // on every successful refresh, so regular use never hits it.
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      // sha256 hash of the current refresh token's secret half (see auth.service.js
      // rotateSession). Null means either a legacy pre-refresh-token session (rejected
      // by auth.middleware.js) or a session that's been logged out.
      refreshTokenHash: { type: DataTypes.STRING(64), allowNull: true },
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
