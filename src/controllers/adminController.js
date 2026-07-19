const prisma = require('../config/prisma');

async function audit(actorId, action, targetId, meta) {
  await prisma.auditLog.create({ data: { actorId, action, targetId, meta } });
}

async function banUser(req, res, next) {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    const user = await prisma.user.update({
      where: { id: userId },
      data: { isBanned: true, banReason: reason || 'Порушення правил' },
    });
    await audit(req.user.id, 'BAN_USER', userId, { reason });
    req.app.get('io').to(`user:${userId}`).emit('force_logout', { reason: user.banReason });
    res.json({ message: 'Користувача заблоковано', user: { id: user.id, isBanned: true } });
  } catch (err) {
    next(err);
  }
}

async function unbanUser(req, res, next) {
  try {
    const { userId } = req.params;
    await prisma.user.update({ where: { id: userId }, data: { isBanned: false, banReason: null } });
    await audit(req.user.id, 'UNBAN_USER', userId, {});
    res.json({ message: 'Розблоковано' });
  } catch (err) {
    next(err);
  }
}

async function deleteAccount(req, res, next) {
  try {
    const { userId } = req.params;
    await prisma.user.delete({ where: { id: userId } });
    await audit(req.user.id, 'DELETE_ACCOUNT', userId, {});
    res.json({ message: 'Акаунт видалено' });
  } catch (err) {
    next(err);
  }
}

async function deleteMessage(req, res, next) {
  try {
    const { messageId } = req.params;
    const msg = await prisma.message.update({
      where: { id: messageId },
      data: { isDeleted: true, content: null },
    });
    await audit(req.user.id, 'DELETE_MESSAGE', messageId, {});
    req.app.get('io').to(`chat:${msg.chatId}`).emit('message:deleted', { id: messageId, chatId: msg.chatId });
    res.json({ message: 'Повідомлення видалено модератором' });
  } catch (err) {
    next(err);
  }
}

async function stats(req, res, next) {
  try {
    const [users, messages, chats, bannedUsers, onlineUsers] = await Promise.all([
      prisma.user.count(),
      prisma.message.count({ where: { isDeleted: false } }),
      prisma.chat.count(),
      prisma.user.count({ where: { isBanned: true } }),
      prisma.user.count({ where: { presence: 'ONLINE' } }),
    ]);
    res.json({ users, messages, chats, bannedUsers, onlineUsers });
  } catch (err) {
    next(err);
  }
}

async function logs(req, res, next) {
  try {
    const { take = 100 } = req.query;
    const entries = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(take), 500),
      include: { actor: { select: { nickname: true } } },
    });
    res.json({ logs: entries });
  } catch (err) {
    next(err);
  }
}

module.exports = { banUser, unbanUser, deleteAccount, deleteMessage, stats, logs };
