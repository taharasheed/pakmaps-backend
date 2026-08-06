module.exports = (sequelize, DataTypes) => {
  const ServiceHealthCheck = sequelize.define(
    'ServiceHealthCheck',
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      serviceId: { type: DataTypes.UUID, allowNull: false },
      status: { type: DataTypes.ENUM('up', 'down'), allowNull: false },
      latencyMs: { type: DataTypes.INTEGER, allowNull: true },
      source: { type: DataTypes.ENUM('active', 'passive'), allowNull: false, defaultValue: 'active' },
      errorMessage: { type: DataTypes.STRING(500), allowNull: true },
      checkedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'service_health_checks',
      underscored: true,
      timestamps: false,
      indexes: [{ fields: ['service_id', 'checked_at'] }],
    }
  );

  ServiceHealthCheck.associate = (models) => {
    ServiceHealthCheck.belongsTo(models.ApiService, { foreignKey: 'serviceId', as: 'service' });
  };

  return ServiceHealthCheck;
};
