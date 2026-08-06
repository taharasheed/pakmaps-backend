const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const service = require('./notifications.service');

const list = asyncHandler(async (req, res) => {
  const { page, pageSize, isRead } = req.query;
  const [{ rows, count }, unread] = await Promise.all([
    service.listForUser(req.user.id, { page, pageSize, isRead }),
    service.unreadCount(req.user.id),
  ]);
  return ok(res, { rows, page, pageSize, total: count, totalPages: Math.ceil(count / pageSize), unreadCount: unread });
});

const markRead = asyncHandler(async (req, res) => {
  await service.markAsRead(req.user.id, req.params.id);
  return ok(res, null, 'Marked as read.');
});

const markAllRead = asyncHandler(async (req, res) => {
  await service.markAllAsRead(req.user.id);
  return ok(res, null, 'All notifications marked as read.');
});

module.exports = { list, markRead, markAllRead };
