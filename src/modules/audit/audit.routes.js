const router = require('express').Router();
const { authMiddleware } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');
const validate = require('../../middleware/validate');
const { listAuditLogsSchema } = require('./audit.validation');
const controller = require('./audit.controller');

router.get('/', authMiddleware, requirePermission('audit_logs', 'view'), validate(listAuditLogsSchema), controller.listAuditLogs);

module.exports = router;
