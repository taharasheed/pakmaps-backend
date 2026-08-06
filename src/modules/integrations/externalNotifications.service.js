const { Notification } = require('../../db/models');

// Scoped strictly to (appId, externalRecipientId) - the calling app's own API
// key, not a Pak Maps user session. Kept separate from notifications.service.js
// (which scopes by recipientUserId under a JWT) so a bug in one trust boundary
// can't leak into the other.
async function createForRecipient(appId, { externalRecipientId, type, title, message, meta = null }) {
  return Notification.create({ appId, externalRecipientId, type, title, message, meta });
}

async function listForRecipient(appId, externalRecipientId, { page = 1, pageSize = 20, isRead } = {}) {
  const where = { appId, externalRecipientId };
  if (isRead !== undefined) where.isRead = isRead;

  return Notification.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
}

async function unreadCount(appId, externalRecipientId) {
  return Notification.count({ where: { appId, externalRecipientId, isRead: false } });
}

async function markAsRead(appId, notificationId) {
  const [count] = await Notification.update({ isRead: true }, { where: { id: notificationId, appId } });
  return count > 0;
}

async function markAllAsRead(appId, externalRecipientId) {
  await Notification.update({ isRead: true }, { where: { appId, externalRecipientId, isRead: false } });
}

module.exports = { createForRecipient, listForRecipient, unreadCount, markAsRead, markAllAsRead };
