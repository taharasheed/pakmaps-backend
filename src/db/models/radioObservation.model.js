module.exports = (sequelize, DataTypes) => {
  const RadioObservation = sequelize.define(
    'RadioObservation',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      installationId: { type: DataTypes.STRING(100), allowNull: false },
      userId: { type: DataTypes.UUID, allowNull: true },
      capturedAt: { type: DataTypes.DATE, allowNull: false },
      receivedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      // 'resolve' (lookup) or 'observation' (learning upload).
      requestKind: { type: DataTypes.STRING(20), allowNull: false },
      matchedPlaceId: { type: DataTypes.UUID, allowNull: true },
      decision: { type: DataTypes.STRING(30), allowNull: false },
      confidence: { type: DataTypes.DOUBLE, allowNull: true },
      collectorStatus: { type: DataTypes.STRING(30), allowNull: true },
      wifiCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      cellCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      matcherVersion: { type: DataTypes.STRING(30), allowNull: false },
      requestId: { type: DataTypes.STRING(60), allowNull: false },
      // Declared explicitly (timestamps:false means Sequelize won't manage
      // it automatically) because the migration's DB-level default on this
      // column never actually took effect - see createdAt on
      // anchorEvidence.model.js for the same fix and why.
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'radio_observations',
      underscored: true,
      timestamps: false,
    }
  );

  RadioObservation.associate = (models) => {
    RadioObservation.hasMany(models.WifiObservation, { foreignKey: 'observationId', as: 'wifiObservations' });
    RadioObservation.hasMany(models.CellObservation, { foreignKey: 'observationId', as: 'cellObservations' });
    RadioObservation.hasOne(models.AnchorEvidence, { foreignKey: 'observationId', as: 'anchorEvidence' });
    RadioObservation.belongsTo(models.RadioPlace, { foreignKey: 'matchedPlaceId', as: 'matchedPlace' });
  };

  return RadioObservation;
};
