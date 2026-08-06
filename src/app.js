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
app.set('trust proxy', env.TRUST_PROXY);
app.use(helmet());
app.use(
  cors({
    origin: env.ADMIN_PANEL_ORIGIN,
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
    autoLogging: { ignore: (req) => req.url === '/health' },
  })
);

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
