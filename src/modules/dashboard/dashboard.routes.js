const router = require('express').Router();
const { authMiddleware } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');
const controller = require('./dashboard.controller');

router.get('/summary', authMiddleware, requirePermission('dashboard', 'view'), controller.getSummary);

module.exports = router;
