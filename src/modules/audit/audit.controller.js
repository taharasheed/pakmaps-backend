const { Op } = require('sequelize');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const { AuditLog, ApiActivityLog, User } = require('../../db/models');

const listAuditLogs = asyncHandler(async (req, res) => {
  const { from, to, action, entityType, actorUserId, source, page, pageSize } = req.query;

  const where = {};
  if (from || to) where.createdAt = {};
  if (from) where.createdAt[Op.gte] = new Date(from);
  if (to) where.createdAt[Op.lte] = new Date(to);
  if (action) where.action = action;
  if (entityType) where.entityType = entityType;
  if (actorUserId) where.actorUserId = actorUserId;
  if (source) where.source = source;

  const { rows, count } = await AuditLog.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  return ok(res, { rows, page, pageSize, total: count, totalPages: Math.ceil(count / pageSize) });
});

// Same underlying data as Statistics > Recent activity - exposed again here,
// gated by the audit_logs permission instead of statistics, so it can live
// as its own tab on the Audit Logs page without requiring both permissions.
const listApiActivity = asyncHandler(async (req, res) => {
  const { from, to, serviceSlug, userId, status, source, page, pageSize } = req.query;

  const where = {};
  if (from || to) where.createdAt = {};
  if (from) where.createdAt[Op.gte] = new Date(from);
  if (to) where.createdAt[Op.lte] = new Date(to);
  if (serviceSlug) where.serviceSlug = serviceSlug;
  if (userId) where.userId = userId;
  if (status) where.status = status;
  if (source) where.source = source;

  const { rows, count } = await ApiActivityLog.findAndCountAll({
    where,
    include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'], required: false }],
    order: [['createdAt', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  return ok(res, { rows, page, pageSize, total: count, totalPages: Math.ceil(count / pageSize) });
});

module.exports = { listAuditLogs, listApiActivity };
