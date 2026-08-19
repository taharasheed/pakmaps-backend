const router = require('express').Router();
const { authMiddleware } = require('../../middleware/auth.middleware');
const controller = require('./notificationHub.controller');

router.post('/connect-token', authMiddleware, controller.refreshConnectToken);

module.exports = router;
