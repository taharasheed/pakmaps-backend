const { recordAudit } = require('../modules/audit/audit.service');

function auditAction(action, entityType) {
  return function auditMiddleware(req, res, next) {
    res.on('finish', () => {
      if (res.statusCode >= 400) return;
      const entityId = req.auditMeta?.entityId ?? req.params?.id ?? null;
      const changes = req.auditMeta?.changes ?? req.body ?? null;
      recordAudit({ req, user: req.user, action, entityType, entityId, changes, statusCode: res.statusCode });
    });
    next();
  };
}

module.exports = { auditAction };
