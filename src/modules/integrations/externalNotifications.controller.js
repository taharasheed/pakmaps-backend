const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/apiResponse');
const AppError = require('../../utils/AppError');
const { checkRateLimit } = require('../proxy/rateLimiter');
const service = require('./externalNotifications.service');

const createNotification = asyncHandler(async (req, res) => {
  await checkRateLimit({ identity: `integration:${req.integrationApp.id}` });

  const notification = await service.createForRecipient(req.integrationApp.id, req.body);
  return created(res, notification, 'Notification queued.');
});

const listNotifications = asyncHandler(async (req, res) => {
  const { externalRecipientId, page, pageSize, isRead } = req.query;
  const [{ rows, count }, unread] = await Promise.all([
    service.listForRecipient(req.integrationApp.id, externalRecipientId, { page, pageSize, isRead }),
    service.unreadCount(req.integrationApp.id, externalRecipientId),
  ]);
  return ok(res, { rows, page, pageSize, total: count, totalPages: Math.ceil(count / pageSize), unreadCount: unread });
});

const markRead = asyncHandler(async (req, res) => {
  const updated = await service.markAsRead(req.integrationApp.id, req.params.id);
  if (!updated) throw new AppError('Notification not found.', 404);
  return ok(res, null, 'Marked as read.');
});

const markAllRead = asyncHandler(async (req, res) => {
  await service.markAllAsRead(req.integrationApp.id, req.query.externalRecipientId);
  return ok(res, null, 'All notifications marked as read.');
});

module.exports = { createNotification, listNotifications, markRead, markAllRead };
