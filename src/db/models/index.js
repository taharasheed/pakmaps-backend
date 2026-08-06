const fs = require('fs');
const path = require('path');
const { DataTypes, Sequelize } = require('sequelize');
const sequelize = require('../../config/database');

const basename = path.basename(__filename);
const db = {};

fs.readdirSync(__dirname)
  .filter((file) => file !== basename && file.endsWith('.model.js'))
  .forEach((file) => {
    const factory = require(path.join(__dirname, file));
    const model = factory(sequelize, DataTypes);
    db[model.name] = model;
  });

Object.values(db).forEach((model) => {
  if (typeof model.associate === 'function') {
    model.associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
