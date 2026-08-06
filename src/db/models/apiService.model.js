module.exports = (sequelize, DataTypes) => {
  const ApiService = sequelize.define(
    'ApiService',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      slug: { type: DataTypes.STRING(60), allowNull: false, unique: true },
      name: { type: DataTypes.STRING(150), allowNull: false },
      handlerKey: { type: DataTypes.STRING(60), allowNull: false },
      baseUrl: { type: DataTypes.STRING(500), allowNull: false, defaultValue: '' },
      isEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      healthCheckPath: { type: DataTypes.STRING(300), allowNull: true },
      rateLimitOverride: { type: DataTypes.INTEGER, allowNull: true },
      cacheTtlSeconds: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      cacheable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      concurrencyLimit: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 50 },
    },
    {
      tableName: 'api_services',
      underscored: true,
      timestamps: true,
    }
  );

  ApiService.associate = (models) => {
    ApiService.hasMany(models.ApiUsageDaily, { foreignKey: 'serviceId', as: 'usageDaily' });
    ApiService.hasMany(models.ServiceHealthCheck, { foreignKey: 'serviceId', as: 'healthChecks' });
  };

  return ApiService;
};
