module.exports = (sequelize, DataTypes) => {
  const RadioInferredTrajectory = sequelize.define(
    'RadioInferredTrajectory',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      requestId: { type: DataTypes.STRING(60), allowNull: false },
      installationId: { type: DataTypes.STRING(100), allowNull: false },
      capturedAt: { type: DataTypes.DATE, allowNull: false },
      receivedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },

      anchorObservationId: { type: DataTypes.UUID, allowNull: false },
      anchorCapturedAt: { type: DataTypes.DATE, allowNull: false },
      anchorAccuracyM: { type: DataTypes.DOUBLE, allowNull: false },
      anchorAgeMs: { type: DataTypes.INTEGER, allowNull: false },
      anchorSource: { type: DataTypes.STRING(30), allowNull: false },

      latitude: { type: DataTypes.DOUBLE, allowNull: false },
      longitude: { type: DataTypes.DOUBLE, allowNull: false },
      horizontalUncertaintyM: { type: DataTypes.DOUBLE, allowNull: false },

      distanceSinceAnchorM: { type: DataTypes.DOUBLE, allowNull: false },
      stepsSinceAnchor: { type: DataTypes.INTEGER, allowNull: false },
      headingDeg: { type: DataTypes.DOUBLE, allowNull: false },
      headingAccuracyDeg: { type: DataTypes.DOUBLE, allowNull: false },

      wifiEvidence: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      cellEvidence: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      wifiCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      cellCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

      resolverPlaceId: { type: DataTypes.UUID, allowNull: true },
      resolverConfidence: { type: DataTypes.DOUBLE, allowNull: true },

      // See radioObservation.model.js / anchorEvidence.model.js for why this
      // is declared explicitly rather than relying on the migration default.
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'radio_inferred_trajectories',
      underscored: true,
      timestamps: false,
    }
  );

  RadioInferredTrajectory.associate = (models) => {
    RadioInferredTrajectory.belongsTo(models.RadioObservation, { foreignKey: 'anchorObservationId', as: 'anchorObservation' });
    RadioInferredTrajectory.belongsTo(models.RadioPlace, { foreignKey: 'resolverPlaceId', as: 'resolverPlace' });
  };

  return RadioInferredTrajectory;
};
