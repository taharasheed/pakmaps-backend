module.exports = (sequelize, DataTypes) => {
  const AuditLog = sequelize.define(
    'AuditLog',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      actorUserId: { type: DataTypes.UUID, allowNull: true },
      actorName: { type: DataTypes.STRING(150), allowNull: true },
      actorEmail: { type: DataTypes.STRING(200), allowNull: true },
      action: { type: DataTypes.STRING(50), allowNull: false },
      entityType: { type: DataTypes.STRING(80), allowNull: true },
      entityId: { type: DataTypes.STRING(100), allowNull: true },
      source: { type: DataTypes.ENUM('web', 'mobile'), allowNull: false, defaultValue: 'web' },
      ipAddress: { type: DataTypes.STRING(64), allowNull: true },
      userAgent: { type: DataTypes.STRING(500), allowNull: true },
      changes: { type: DataTypes.JSONB, allowNull: true },
      statusCode: { type: DataTypes.INTEGER, allowNull: true },
    },
    {
      tableName: 'audit_logs',
      underscored: true,
      timestamps: true,
      updatedAt: false,
      indexes: [
        { fields: ['actor_user_id'] },
        { fields: ['action'] },
        { fields: ['created_at'] },
      ],
    }
  );

  return AuditLog;
};
