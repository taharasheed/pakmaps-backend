module.exports = (sequelize, DataTypes) => {
  const ApiActivityLog = sequelize.define(
    'ApiActivityLog',
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      userId: { type: DataTypes.UUID, allowNull: true },
      serviceSlug: { type: DataTypes.STRING(60), allowNull: false },
      source: { type: DataTypes.ENUM('web', 'mobile'), allowNull: false, defaultValue: 'mobile' },
      requestParams: { type: DataTypes.JSONB, allowNull: true },
      responseSummary: { type: DataTypes.JSONB, allowNull: true },
      status: { type: DataTypes.ENUM('success', 'error'), allowNull: false },
      statusCode: { type: DataTypes.INTEGER, allowNull: true },
      latencyMs: { type: DataTypes.INTEGER, allowNull: true },
      cacheHit: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      ipAddress: { type: DataTypes.STRING(64), allowNull: true },
      deviceInfo: { type: DataTypes.JSONB, allowNull: true },
      lat: { type: DataTypes.DECIMAL(9, 6), allowNull: true },
      lon: { type: DataTypes.DECIMAL(9, 6), allowNull: true },
    },
    {
      tableName: 'api_activity_logs',
      underscored: true,
      timestamps: true,
      updatedAt: false,
      indexes: [
        { fields: ['user_id'] },
        { fields: ['service_slug'] },
        { fields: ['created_at'] },
      ],
    }
  );

  ApiActivityLog.associate = (models) => {
    ApiActivityLog.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
  };

  return ApiActivityLog;
};
