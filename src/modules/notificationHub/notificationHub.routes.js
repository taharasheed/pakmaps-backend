const router = require('express').Router();
const { authMiddleware } = require('../../middleware/auth.middleware');
const controller = require('./notificationHub.controller');

router.post('/connect-token', authMiddleware, controller.refreshConnectToken);
router.post('/subscription-credential', authMiddleware, controller.issueSubscriptionCredential);
router.post('/r1-push-credential', authMiddleware, controller.issueR1PushCredential);

module.exports = router;
