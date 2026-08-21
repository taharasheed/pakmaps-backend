module.exports = (sequelize, DataTypes) => {
  const WifiSignature = sequelize.define(
    'WifiSignature',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      placeId: { type: DataTypes.UUID, allowNull: false },
      bssidToken: { type: DataTypes.STRING(64), allowNull: false },
      tokenKeyVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      meanRssi: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
      rssiM2: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
      rssiSampleCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      connectedObservationCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      frequencyMhz: { type: DataTypes.INTEGER, allowNull: true },
      channelWidth: { type: DataTypes.INTEGER, allowNull: true },
      stabilityScore: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 1 },
      mobilityScore: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
      unstable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      quarantineReason: { type: DataTypes.STRING(200), allowNull: true },
      firstSeenAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      lastSeenAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'wifi_signatures',
      underscored: true,
      timestamps: true,
    }
  );

  WifiSignature.associate = (models) => {
    WifiSignature.belongsTo(models.RadioPlace, { foreignKey: 'placeId', as: 'place' });
  };

  return WifiSignature;
};
