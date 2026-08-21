module.exports = (sequelize, DataTypes) => {
  const RadioPlace = sequelize.define(
    'RadioPlace',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      latitude: { type: DataTypes.DOUBLE, allowNull: false },
      longitude: { type: DataTypes.DOUBLE, allowNull: false },
      altitudeM: { type: DataTypes.DOUBLE, allowNull: true },
      floorId: { type: DataTypes.STRING(60), allowNull: true },
      horizontalUncertaintyM: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 150 },
      confirmationCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      distinctDeviceCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      trustScore: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'candidate' },
      version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      firstSeenAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      lastSeenAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'radio_places',
      underscored: true,
      timestamps: true,
    }
  );

  RadioPlace.associate = (models) => {
    RadioPlace.hasMany(models.WifiSignature, { foreignKey: 'placeId', as: 'wifiSignatures' });
    RadioPlace.hasMany(models.CellSignature, { foreignKey: 'placeId', as: 'cellSignatures' });
  };

  return RadioPlace;
};
