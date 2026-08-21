module.exports = (sequelize, DataTypes) => {
  const WifiObservation = sequelize.define(
    'WifiObservation',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      observationId: { type: DataTypes.UUID, allowNull: false },
      bssidToken: { type: DataTypes.STRING(64), allowNull: false },
      rssiDbm: { type: DataTypes.INTEGER, allowNull: false },
      frequencyMhz: { type: DataTypes.INTEGER, allowNull: true },
      channelWidth: { type: DataTypes.INTEGER, allowNull: true },
      connected: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      ageMs: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    {
      tableName: 'wifi_observations',
      underscored: true,
      timestamps: false,
    }
  );

  WifiObservation.associate = (models) => {
    WifiObservation.belongsTo(models.RadioObservation, { foreignKey: 'observationId', as: 'observation' });
  };

  return WifiObservation;
};
