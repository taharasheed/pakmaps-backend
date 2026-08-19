const router = require('express').Router();
const { proxyAuthMiddleware } = require('./proxyAuth.middleware');
const { handleProxyRequest } = require('./gateway');
const tilesController = require('./controllers/tiles.controller');

router.use(proxyAuthMiddleware);

router.get('/tiles/:style{/:z/:x/:y}', tilesController.getTiles);
// Own service slug ('tiles-buildings'), not 'tiles' - this hits the same
// tileserver but needs its own concurrency pool/circuit breaker. Sharing
// 'tiles' meant a burst of buildings-layer requests could trip the breaker
// for core map tiles too, which happened live on 2026-08-18 right after
// buildings went nationwide.
router.get('/tiles-source/:source/:z/:x/:y', handleProxyRequest('tiles-buildings', 'extraVectorTiles'));
router.get('/autocomplete', handleProxyRequest('autocomplete'));
router.get('/search', handleProxyRequest('search'));
router.get('/reverse_geocoding', handleProxyRequest('reverse_geocoding'));
router.post('/routing', handleProxyRequest('routing'));

module.exports = router;
