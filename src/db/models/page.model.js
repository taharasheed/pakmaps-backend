module.exports = (sequelize, DataTypes) => {
  const Page = sequelize.define(
    'Page',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      key: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      label: { type: DataTypes.STRING(150), allowNull: false },
      sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    {
      tableName: 'pages',
      underscored: true,
      timestamps: true,
    }
  );

  Page.associate = (models) => {
    Page.hasMany(models.Permission, { foreignKey: 'pageId', as: 'permissions' });
  };

  return Page;
};
