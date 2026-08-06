const router = require('express').Router();
const { apiKeyAuthMiddleware } = require('../../middleware/apiKeyAuth.middleware');
const validate = require('../../middleware/validate');
const {
  createNotificationSchema,
  listNotificationsSchema,
  markReadParamsSchema,
  markAllReadSchema,
} = require('./externalNotifications.validation');
const controller = require('./externalNotifications.controller');

router.use(apiKeyAuthMiddleware);

router.post('/', validate(createNotificationSchema), controller.createNotification);
router.get('/', validate(listNotificationsSchema), controller.listNotifications);
router.patch('/read-all', validate(markAllReadSchema), controller.markAllRead);
router.patch('/:id/read', validate(markReadParamsSchema), controller.markRead);

module.exports = router;
