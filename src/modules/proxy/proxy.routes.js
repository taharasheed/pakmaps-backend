const router = require('express').Router();
const { proxyAuthMiddleware } = require('./proxyAuth.middleware');
const { handleProxyRequest } = require('./gateway');
const tilesController = require('./controllers/tiles.controller');

router.use(proxyAuthMiddleware);

router.get('/tiles/:style{/:z/:x/:y}', tilesController.getTiles);
router.get('/tiles-3d/:style{/:z/:x/:y}', tilesController.getVectorTiles);
router.get('/autocomplete', handleProxyRequest('autocomplete'));
router.get('/search', handleProxyRequest('search'));
router.get('/reverse_geocoding', handleProxyRequest('reverse_geocoding'));
router.post('/routing', handleProxyRequest('routing'));

module.exports = router;
