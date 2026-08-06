#!/bin/sh
set -e

echo "Waiting for Postgres at ${DB_HOST}:${DB_PORT}..."
until nc -z "${DB_HOST}" "${DB_PORT}"; do
  sleep 1
done

echo "Running database migrations..."
npx sequelize-cli db:migrate

echo "Running database seeders..."
npx sequelize-cli db:seed:all

echo "Starting Pak Maps backend..."
exec node src/server.js
