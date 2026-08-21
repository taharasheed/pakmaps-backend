module.exports = (sequelize, DataTypes) => {
  const DeviceTrust = sequelize.define(
    'DeviceTrust',
    {
      installationId: { type: DataTypes.STRING(100), allowNull: false, primaryKey: true },
      acceptedAnchorCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      rejectedAnchorCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      impossibleJumpCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      conflictCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      trustScore: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0.5 },
      lastSeenAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'device_trust',
      underscored: true,
      timestamps: true,
    }
  );

  return DeviceTrust;
};
