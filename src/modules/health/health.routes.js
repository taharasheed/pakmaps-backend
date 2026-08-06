const router = require('express').Router();
const { authMiddleware } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');
const controller = require('./health.controller');

router.get('/services', authMiddleware, requirePermission('dashboard', 'view'), controller.getServiceStatuses);

module.exports = router;
