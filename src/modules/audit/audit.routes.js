const router = require('express').Router();
const { authMiddleware } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');
const validate = require('../../middleware/validate');
const { listAuditLogsSchema, listApiActivitySchema } = require('./audit.validation');
const controller = require('./audit.controller');

router.get('/', authMiddleware, requirePermission('audit_logs', 'view'), validate(listAuditLogsSchema), controller.listAuditLogs);
router.get('/api-activity', authMiddleware, requirePermission('audit_logs', 'view'), validate(listApiActivitySchema), controller.listApiActivity);

module.exports = router;
