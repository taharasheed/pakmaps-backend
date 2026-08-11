// Public (app-facing) tile serving for admin-uploaded imagery layers.
// Deliberately its own router mounted at /v1/proxy/imagery-layers from
// routes/index.js - NOT added into proxy.routes.js - so the existing,
// already-working tiles/search/routing/etc. proxy paths are never touched
// by this feature.
const router = require('express').Router();
const { proxyAuthMiddleware } = require('../proxy/proxyAuth.middleware');
const controller = require('./imageryTiles.controller');

router.use(proxyAuthMiddleware);

router.get('/', controller.listEnabledLayers);
router.get('/:id/:z/:x/:y', controller.getTile);

module.exports = router;
