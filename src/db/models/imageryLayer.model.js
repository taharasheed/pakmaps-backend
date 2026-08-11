module.exports = (sequelize, DataTypes) => {
  const ImageryLayer = sequelize.define(
    'ImageryLayer',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING(150), allowNull: false },
      slug: { type: DataTypes.STRING(80), allowNull: false, unique: true },
      description: { type: DataTypes.STRING(500), allowNull: true },
      storedFilename: { type: DataTypes.STRING(255), allowNull: false },
      originalFilename: { type: DataTypes.STRING(255), allowNull: false },
      fileSizeBytes: { type: DataTypes.BIGINT, allowNull: false },
      tileFormat: { type: DataTypes.STRING(10), allowNull: false },
      minZoom: { type: DataTypes.INTEGER, allowNull: false },
      maxZoom: { type: DataTypes.INTEGER, allowNull: false },
      boundsWest: { type: DataTypes.DOUBLE, allowNull: true },
      boundsSouth: { type: DataTypes.DOUBLE, allowNull: true },
      boundsEast: { type: DataTypes.DOUBLE, allowNull: true },
      boundsNorth: { type: DataTypes.DOUBLE, allowNull: true },
      isEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      uploadedBy: { type: DataTypes.UUID, allowNull: true },
      // [{id: 'water'}, {id: 'building'}, ...] - the source-layer names
      // inside a pbf/vector tileset, from its TileJSON metadata. Null for
      // raster layers, or for a vector layer whose metadata lacked this.
      vectorLayers: { type: DataTypes.JSONB, allowNull: true },
    },
    {
      tableName: 'imagery_layers',
      underscored: true,
      timestamps: true,
    }
  );

  return ImageryLayer;
};
