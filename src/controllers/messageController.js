const prisma = require('../config/prisma');

async function getHistory(req, res, next) {
  try {
    const { chatId } = req.params;
    const { before, limit = 50 } = req.query;

    const membership = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.user.id } },
    });
    if (!membership) return res.status(403).json({ error: 'Ви не учасник цього чату' });

    const messages = await prisma.message.findMany({
      where: {
        chatId,
        isDeleted: false,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      include: {
        author: { select: { id: true, nickname: true, avatarUrl: true } },
        reactions: true,
        replyTo: { select: { id: true, content: true, authorId: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(limit), 100),
    });

    res.json({ messages: messages.reverse() });
  } catch (err) {
    next(err);
  }
}

async function forwardMessage(req, res, next) {
  try {
    const { messageId, targetChatId } = req.body;
    const original = await prisma.message.findUnique({ where: { id: messageId } });
    if (!original) return res.status(404).json({ error: 'Повідомлення не знайдено' });

    const membership = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId: targetChatId, userId: req.user.id } },
    });
    if (!membership) return res.status(403).json({ error: 'Немає доступу до цільового чату' });

    const forwarded = await prisma.message.create({
      data: {
        chatId: targetChatId,
        authorId: req.user.id,
        type: original.type,
        content: original.content,
        fileMeta: original.fileMeta,
        forwardedFromId: original.id,
      },
      include: { author: { select: { id: true, nickname: true, avatarUrl: true } } },
    });

    req.app.get('io').to(`chat:${targetChatId}`).emit('message:new', forwarded);
    res.status(201).json({ message: forwarded });
  } catch (err) {
    next(err);
  }
}

module.exports = { getHistory, forwardMessage };
