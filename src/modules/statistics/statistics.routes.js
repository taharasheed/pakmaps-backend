const router = require('express').Router();
const { authMiddleware } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');
const validate = require('../../middleware/validate');
const { usageReportSchema, activityLogSchema } = require('./statistics.validation');
const controller = require('./statistics.controller');

router.use(authMiddleware, requirePermission('statistics', 'view'));

router.get('/usage', validate(usageReportSchema), controller.getUsageReport);
router.get('/usage/export', validate(usageReportSchema), controller.exportUsageCsv);
router.get('/activity', validate(activityLogSchema), controller.getActivityLogs);

module.exports = router;
