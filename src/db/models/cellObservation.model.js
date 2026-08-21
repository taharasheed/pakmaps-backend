module.exports = (sequelize, DataTypes) => {
  const CellObservation = sequelize.define(
    'CellObservation',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      observationId: { type: DataTypes.UUID, allowNull: false },
      radio: { type: DataTypes.STRING(10), allowNull: false },
      mcc: { type: DataTypes.STRING(6), allowNull: false },
      mnc: { type: DataTypes.STRING(6), allowNull: false },
      area: { type: DataTypes.INTEGER, allowNull: true },
      cellId: { type: DataTypes.BIGINT, allowNull: true },
      pci: { type: DataTypes.INTEGER, allowNull: true },
      channel: { type: DataTypes.INTEGER, allowNull: true },
      registered: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      signalDbm: { type: DataTypes.INTEGER, allowNull: true },
      ageMs: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    {
      tableName: 'cell_observations',
      underscored: true,
      timestamps: false,
    }
  );

  CellObservation.associate = (models) => {
    CellObservation.belongsTo(models.RadioObservation, { foreignKey: 'observationId', as: 'observation' });
  };

  return CellObservation;
};
