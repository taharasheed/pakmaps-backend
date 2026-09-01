module.exports = (sequelize, DataTypes) => {
  const ImageryLayer = sequelize.define(
    'ImageryLayer',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING(150), allowNull: false },
      slug: { type: DataTypes.STRING(80), allowNull: false, unique: true },
      description: { type: DataTypes.STRING(500), allowNull: true },
      // Null for a 'proxy' sourceType row - it has no file on disk.
      storedFilename: { type: DataTypes.STRING(255), allowNull: true },
      originalFilename: { type: DataTypes.STRING(255), allowNull: true },
      fileSizeBytes: { type: DataTypes.BIGINT, allowNull: true },
      tileFormat: { type: DataTypes.STRING(10), allowNull: false },
      // 'upload': tiles read from storedFilename's local .mbtiles.
      // 'proxy': tiles fetched live from the tileserver-gl style named by
      // proxyStyle - used for layers that already exist as a base-map style
      // (see proxy/adapters/tiles.adapter.js) and are just also exposed here
      // for enable/disable + priority control alongside uploaded layers.
      sourceType: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'upload' },
      proxyStyle: { type: DataTypes.STRING(50), allowNull: true },
      minZoom: { type: DataTypes.INTEGER, allowNull: false },
      maxZoom: { type: DataTypes.INTEGER, allowNull: false },
      boundsWest: { type: DataTypes.DOUBLE, allowNull: true },
      boundsSouth: { type: DataTypes.DOUBLE, allowNull: true },
      boundsEast: { type: DataTypes.DOUBLE, allowNull: true },
      boundsNorth: { type: DataTypes.DOUBLE, allowNull: true },
      isEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      // Higher wins when this layer's coverage overlaps another enabled
      // layer of the same tileFormat - see the mosaic tile lookup in
      // imageryTiles.controller.js. Admin-set, not inferred from zoom/
      // resolution, since two layers can tie on resolution and still need
      // an explicit pick (e.g. which capture date is more current).
      priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
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
