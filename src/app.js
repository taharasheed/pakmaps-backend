const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const pinoHttp = require('pino-http');

const env = require('./config/env');
const logger = require('./config/logger');
const requestId = require('./middleware/requestId');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const routes = require('./routes');

const app = express();

// CORS only governs browser requests (the admin panel); native mobile app
// requests aren't subject to CORS at all, so this doesn't need to allow them.
// TEMP-DEMO-CORS: localhost:8888 added for a one-off MapLibre demo page, remove after.
// TRUST_PROXY as a numeric hop count (e.g. "1") must be a Number, not a
// string, or Express silently fails to treat X-Forwarded-* as trusted -
// this broke req.protocol behind nginx (always read back as "http").
const trustProxyValue = /^\d+$/.test(env.TRUST_PROXY) ? Number(env.TRUST_PROXY) : env.TRUST_PROXY;
app.set('trust proxy', trustProxyValue);
app.use(helmet());
app.use(
  cors({
    origin: [env.ADMIN_PANEL_ORIGIN, 'http://localhost:8888'],
    credentials: true,
  })
);
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(requestId);
app.use(
  pinoHttp({
    logger,
    genReqId: (req) => req.id,
    // /navigation/map-match handles its own metadata-only logging (no
    // coordinates/bodies/tokens ever, per its privacy requirements) -
    // excluded from the default request/response auto-logger the same way
    // /health already is.
    autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/api/navigation/map-match' },
  })
);

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
