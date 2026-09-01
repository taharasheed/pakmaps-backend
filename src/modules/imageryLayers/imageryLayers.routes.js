const router = require('express').Router();
const { authMiddleware } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');
const validate = require('../../middleware/validate');
const { idOnly, toggleSchema, prioritySchema, listLayersSchema } = require('./imageryLayers.validation');
const controller = require('./imageryLayers.controller');

router.use(authMiddleware);

router.get('/', requirePermission('imagery_layers', 'view'), validate(listLayersSchema), controller.listLayers);
router.get('/:id', requirePermission('imagery_layers', 'view'), validate(idOnly), controller.getLayer);
// Multer must run before any req.body validation - it's what parses the
// multipart body in the first place. Name/description are validated inside
// the controller itself for that reason (see uploadLayer).
router.post('/', requirePermission('imagery_layers', 'add'), controller.uploadMiddleware, controller.uploadLayer);
router.patch('/:id/enabled', requirePermission('imagery_layers', 'edit'), validate(toggleSchema), controller.toggleLayer);
router.patch('/:id/priority', requirePermission('imagery_layers', 'edit'), validate(prioritySchema), controller.setPriority);
router.delete('/:id', requirePermission('imagery_layers', 'delete'), validate(idOnly), controller.deleteLayer);

module.exports = router;
