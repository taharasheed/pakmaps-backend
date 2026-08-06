const router = require('express').Router();
const { authMiddleware } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');
const validate = require('../../middleware/validate');
const { createAppSchema, updateAppSchema, idOnlySchema } = require('./notificationApps.validation');
const controller = require('./notificationApps.controller');

router.use(authMiddleware);

router.get('/', requirePermission('integrations', 'view'), controller.listApps);
router.post('/', requirePermission('integrations', 'add'), validate(createAppSchema), controller.createApp);
router.patch('/:id', requirePermission('integrations', 'edit'), validate(updateAppSchema), controller.updateApp);
router.post('/:id/rotate-key', requirePermission('integrations', 'edit'), validate(idOnlySchema), controller.rotateAppKey);
router.delete('/:id', requirePermission('integrations', 'delete'), validate(idOnlySchema), controller.deleteApp);

module.exports = router;
