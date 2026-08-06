const { Notification, User, Role, Permission, Page } = require('../../db/models');
const { Op } = require('sequelize');

// In-app only - there is no email/SMS provider configured for this system.
async function notifyUsersWithPermission(pageKey, action, { type, title, message, meta = null }) {
  const users = await User.findAll({
    attributes: ['id'],
    include: [
      {
        model: Role,
        as: 'role',
        required: true,
        include: [
          {
            model: Permission,
            as: 'permissions',
            required: true,
            where: { action },
            include: [{ model: Page, as: 'page', required: true, where: { key: pageKey } }],
          },
        ],
      },
    ],
  });

  if (users.length === 0) return;

  await Notification.bulkCreate(
    users.map((u) => ({ recipientUserId: u.id, type, title, message, meta }))
  );
}

async function markAsRead(userId, notificationId) {
  await Notification.update({ isRead: true }, { where: { id: notificationId, recipientUserId: userId } });
}

async function markAllAsRead(userId) {
  await Notification.update({ isRead: true }, { where: { recipientUserId: userId, isRead: false } });
}

async function listForUser(userId, { page = 1, pageSize = 20, isRead } = {}) {
  const where = { recipientUserId: userId };
  if (isRead !== undefined) where.isRead = isRead;

  return Notification.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
}

async function unreadCount(userId) {
  return Notification.count({ where: { recipientUserId: userId, isRead: false } });
}

module.exports = { notifyUsersWithPermission, markAsRead, markAllAsRead, listForUser, unreadCount, Op };
