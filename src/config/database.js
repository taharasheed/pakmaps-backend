const { Sequelize } = require('sequelize');
const env = require('./env');
const logger = require('./logger');

const sequelize = new Sequelize(env.DB_NAME, env.DB_USER, env.DB_PASSWORD, {
  host: env.DB_HOST,
  port: env.DB_PORT,
  dialect: 'postgres',
  logging: env.NODE_ENV === 'development' ? (msg) => logger.debug(msg) : false,
  pool: {
    min: env.DB_POOL_MIN,
    max: env.DB_POOL_MAX,
    idle: 10000,
    acquire: 30000,
  },
});

module.exports = sequelize;
