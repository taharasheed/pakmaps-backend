module.exports = (sequelize, DataTypes) => {
  const ApiUsageDaily = sequelize.define(
    'ApiUsageDaily',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      serviceId: { type: DataTypes.UUID, allowNull: false },
      date: { type: DataTypes.DATEONLY, allowNull: false },
      totalCalls: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
      successCalls: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
      errorCalls: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
      cacheHits: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
      avgLatencyMs: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    },
    {
      tableName: 'api_usage_daily',
      underscored: true,
      timestamps: true,
      indexes: [{ unique: true, fields: ['service_id', 'date'] }],
    }
  );

  ApiUsageDaily.associate = (models) => {
    ApiUsageDaily.belongsTo(models.ApiService, { foreignKey: 'serviceId', as: 'service' });
  };

  return ApiUsageDaily;
};
