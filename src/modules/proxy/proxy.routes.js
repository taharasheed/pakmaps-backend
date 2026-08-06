const router = require('express').Router();
const { authMiddleware } = require('../../middleware/auth.middleware');
const { handleProxyRequest } = require('./gateway');

router.use(authMiddleware);

router.get('/tiles/:style/:z/:x/:y', handleProxyRequest('tiles'));
router.get('/geocoding', handleProxyRequest('geocoding'));
router.get('/search', handleProxyRequest('search'));
router.get('/reverse_geocoding', handleProxyRequest('reverse_geocoding'));
router.post('/routing', handleProxyRequest('routing'));
router.post('/isochrone', handleProxyRequest('isochrone'));
router.post('/dem', handleProxyRequest('dem'));

module.exports = router;
