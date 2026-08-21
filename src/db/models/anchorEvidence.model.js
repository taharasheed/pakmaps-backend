module.exports = (sequelize, DataTypes) => {
  const AnchorEvidence = sequelize.define(
    'AnchorEvidence',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      observationId: { type: DataTypes.UUID, allowNull: false },
      latitude: { type: DataTypes.DOUBLE, allowNull: false },
      longitude: { type: DataTypes.DOUBLE, allowNull: false },
      altitudeM: { type: DataTypes.DOUBLE, allowNull: true },
      accuracyM: { type: DataTypes.DOUBLE, allowNull: false },
      source: { type: DataTypes.STRING(30), allowNull: false },
      isMocked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      accepted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      rejectionReason: { type: DataTypes.STRING(60), allowNull: true },
      distanceFromPlaceM: { type: DataTypes.DOUBLE, allowNull: true },
      // Declared explicitly (timestamps:false means Sequelize won't manage
      // it automatically) because the migration's DB-level default on this
      // column never actually took effect - defaultValue: Sequelize.NOW in
      // queryInterface.createTable doesn't generate a real Postgres DEFAULT
      // in this Sequelize version, so an omitted column hits the NOT NULL
      // constraint instead of falling back to one. Every other table in
      // this codebase has timestamps:true, which sidesteps this by having
      // Sequelize supply createdAt from JS on every insert regardless -
      // this is the first timestamps:false table with a created_at column,
      // which is what exposed it.
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'anchor_evidence',
      underscored: true,
      timestamps: false,
    }
  );

  AnchorEvidence.associate = (models) => {
    AnchorEvidence.belongsTo(models.RadioObservation, { foreignKey: 'observationId', as: 'observation' });
  };

  return AnchorEvidence;
};
