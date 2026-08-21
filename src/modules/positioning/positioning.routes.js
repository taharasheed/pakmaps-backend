const router = require('express').Router();
const { authMiddleware } = require('../../middleware/auth.middleware');
const validate = require('../../middleware/validate');
const { resolveBodySchema, observationsBodySchema } = require('./positioning.validation');
const controller = require('./positioning.controller');

// Phase 1 / shadow mode: these endpoints exist and are reachable, but no
// mobile client calls them yet. Nothing here can affect the on-device puck
// until a client integration is built and the rollout in the design doc
// (shadow -> display-only -> route-eligible) actually happens.
router.use(authMiddleware);
router.post('/resolve', validate(resolveBodySchema), controller.resolve);
router.post('/observations', validate(observationsBodySchema), controller.observe);

module.exports = router;
