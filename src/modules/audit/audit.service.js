const { AuditLog } = require('../../db/models');
const logger = require('../../config/logger');
const { getClientLocation } = require('../../utils/requestMeta');

const SENSITIVE_KEYS = ['password', 'passwordHash', 'currentPassword', 'newPassword', 'token'];

function sanitize(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const clone = { ...obj };
  SENSITIVE_KEYS.forEach((key) => {
    if (key in clone) clone[key] = '[redacted]';
  });
  return clone;
}

async function recordAudit({ req, user, action, entityType = null, entityId = null, changes = null, statusCode = 200, source = null }) {
  try {
    const { lat, lon } = req ? getClientLocation(req) : { lat: null, lon: null };
    await AuditLog.create({
      actorUserId: user?.id || null,
      actorName: user?.name || null,
      actorEmail: user?.email || null,
      action,
      entityType,
      entityId: entityId ? String(entityId) : null,
      source: source || req?.auth?.clientType || 'web',
      ipAddress: req?.ip || null,
      userAgent: req?.headers?.['user-agent'] || null,
      changes: changes ? sanitize(changes) : null,
      statusCode,
      lat,
      lon,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to write audit log');
  }
}

module.exports = { recordAudit, sanitize };
