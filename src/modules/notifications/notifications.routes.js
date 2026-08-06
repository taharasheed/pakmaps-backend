const router = require('express').Router();
const { authMiddleware } = require('../../middleware/auth.middleware');
const validate = require('../../middleware/validate');
const { listNotificationsSchema } = require('./notifications.validation');
const controller = require('./notifications.controller');

router.use(authMiddleware);
router.get('/', validate(listNotificationsSchema), controller.list);
router.patch('/read-all', controller.markAllRead);
router.patch('/:id/read', controller.markRead);

module.exports = router;
