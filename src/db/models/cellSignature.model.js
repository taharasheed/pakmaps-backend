module.exports = (sequelize, DataTypes) => {
  const CellSignature = sequelize.define(
    'CellSignature',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      placeId: { type: DataTypes.UUID, allowNull: false },
      radio: { type: DataTypes.STRING(10), allowNull: false },
      mcc: { type: DataTypes.STRING(6), allowNull: false },
      mnc: { type: DataTypes.STRING(6), allowNull: false },
      area: { type: DataTypes.INTEGER, allowNull: false },
      cellId: { type: DataTypes.BIGINT, allowNull: false },
      pci: { type: DataTypes.INTEGER, allowNull: true },
      channel: { type: DataTypes.INTEGER, allowNull: true },
      registeredObservationCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      meanSignalDbm: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
      signalM2: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
      sampleCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      firstSeenAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      lastSeenAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'cell_signatures',
      underscored: true,
      timestamps: true,
    }
  );

  CellSignature.associate = (models) => {
    CellSignature.belongsTo(models.RadioPlace, { foreignKey: 'placeId', as: 'place' });
  };

  return CellSignature;
};
