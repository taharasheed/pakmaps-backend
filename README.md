# Pak Maps Backend

Node.js/Express API that serves the Pak Maps admin panel and the mobile app: auth + RBAC, audit/activity logging, and a caching/queueing/rate-limited gateway in front of the map/geo upstream services (tiles, geocoding, search, reverse geocoding, routing, isochrone, DEM).

## Stack

Express 5, PostgreSQL (Sequelize), Redis (cache, BullMQ job queues, rate limiting).

## Running locally (Docker)

```
cp .env.example .env   # then fill in real secrets
docker compose up --build
```

This starts Postgres, Redis, the backend (migrations + seeders run automatically on container start), and the admin panel. Backend on `http://localhost:5000`, admin panel on `http://localhost:5173`.

The first boot seeds the RBAC pages/permissions catalog, a "Super Admin" role, the 7 proxy service registry rows, and creates one default admin account from `DEFAULT_ADMIN_EMAIL` / `DEFAULT_ADMIN_PASSWORD` in `.env`. **Log in and change that password immediately.**

## Running locally (without Docker)

Requires a running Postgres and Redis reachable at the hosts/ports in `.env`.

```
npm install
npm run migrate
npm run seed
npm run dev
```

## Project layout

```
src/
  config/        env validation, database, redis, queue, logger
  db/            sequelize models, migrations, seeders
  middleware/     auth, RBAC, audit, error handling, validation
  modules/
    auth/          login/logout/me/sessions, web + mobile
    rbac/            roles, users, pages/permissions catalog
    apiServices/      admin CRUD over the proxy service registry
    proxy/             the gateway: cache, rate limiter, concurrency pool
                        + circuit breaker, usage buffer, activity logger,
                        one adapter per upstream service (adapters/)
    health/            active + passive service up/down monitoring
    dashboard/          summary stats for the admin dashboard
    statistics/         filterable usage reports + activity log browsing
    audit/               audit log write path + query endpoint
    notifications/        in-app notifications (no email/SMS in this system)
  jobs/            BullMQ workers + repeatable job scheduling
  app.js / server.js
```

## Adding a new upstream service

1. Add an adapter in `src/modules/proxy/adapters/` (input schema, request builder, response normalizer, cache key).
2. Register it in `src/modules/proxy/adapters/index.js`.
3. Add a row to `api_services` (via the admin panel's API Services page, or a seeder) with `handler_key` matching the adapter.

No gateway or route changes needed - see `src/modules/proxy/gateway.js`.
