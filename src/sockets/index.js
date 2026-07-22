const prisma = require('../config/prisma');
const socketAuthMiddleware = require('./socketAuth');
const { isSpamming, sanitizeText } = require('../middleware/security');
const { messageSendSchema } = require('../utils/validation');
const { notifyOfflineRecipients } = require('../utils/push');

// userId -> Set(socketId) — юзер може мати кілька вкладок/пристроїв
const onlineUsers = new Map();

function registerSocketHandlers(io) {
  io.use(socketAuthMiddleware);

  io.on('connection', async (socket) => {
    const { userId } = socket;

    // --- Присутність: онлайн ---
    if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
    onlineUsers.get(userId).add(socket.id);

    socket.join(`user:${userId}`);
    await prisma.user.update({ where: { id: userId }, data: { presence: 'ONLINE' } });
    io.emit('presence:update', { userId, presence: 'ONLINE' });

    // Автоматично приєднуємо до кімнат усіх чатів користувача
    const memberships = await prisma.chatMember.findMany({ where: { userId } });
    memberships.forEach((m) => socket.join(`chat:${m.chatId}`));

    // --- Приєднання/вихід із конкретного чату (для UI, що відкрито зараз) ---
    socket.on('chat:join', (chatId) => socket.join(`chat:${chatId}`));
    socket.on('chat:leave', (chatId) => socket.leave(`chat:${chatId}`));

    // --- Надсилання повідомлення ---
    socket.on('message:send', async (payload, ack) => {
      try {
        if (isSpamming(userId)) {
          return ack?.({ error: 'Забагато повідомлень, зачекайте трохи' });
        }
        const data = messageSendSchema.parse(payload);

        const membership = await prisma.chatMember.findUnique({
          where: { chatId_userId: { chatId: data.chatId, userId } },
        });
        if (!membership) return ack?.({ error: 'Ви не учасник цього чату' });

        // У каналі писати можуть лише ADMIN/OWNER
        const chat = await prisma.chat.findUnique({ where: { id: data.chatId } });
        if (chat.type === 'CHANNEL' && membership.role === 'MEMBER') {
          return ack?.({ error: 'У цьому каналі писати можуть лише адміністратори' });
        }

        // Якщо це приватний чат і одна сторона заблокувала іншу — не даємо писати
        if (chat.type === 'PRIVATE') {
          const otherMember = await prisma.chatMember.findFirst({
            where: { chatId: data.chatId, userId: { not: userId } },
          });
          if (otherMember) {
            const blocked = await prisma.friendship.findFirst({
              where: {
                status: 'BLOCKED',
                OR: [
                  { senderId: userId, receiverId: otherMember.userId },
                  { senderId: otherMember.userId, receiverId: userId },
                ],
              },
            });
            if (blocked) return ack?.({ error: 'Спілкування з цим користувачем заблоковано' });
          }
        }

        const content = data.content ? sanitizeText(data.content).slice(0, 4000) : null;

        const message = await prisma.message.create({
          data: {
            chatId: data.chatId,
            authorId: userId,
            type: data.type,
            content,
            fileMeta: data.fileMeta,
            replyToId: data.replyToId || null,
          },
          include: {
            author: { select: { id: true, nickname: true, avatarUrl: true } },
            replyTo: { select: { id: true, content: true, authorId: true } },
            reactions: true,
          },
        });

        io.to(`chat:${data.chatId}`).emit('message:new', message);
        ack?.({ message });

        // Офлайн-учасники отримують системне push-сповіщення (як у Telegram)
        notifyOfflineRecipients({
          chatId: data.chatId,
          senderId: userId,
          senderNickname: socket.user.nickname,
          preview: content || `[${data.type}]`,
        }).catch((err) => console.error('Push notification error:', err.message));
      } catch (err) {
        ack?.({ error: err.message || 'Не вдалося надіслати повідомлення' });
      }
    });

    // --- Редагування ---
    socket.on('message:edit', async ({ messageId, content }) => {
      const msg = await prisma.message.findUnique({ where: { id: messageId } });
      if (!msg || msg.authorId !== userId) return;
      const updated = await prisma.message.update({
        where: { id: messageId },
        data: { content: sanitizeText(content).slice(0, 4000), isEdited: true },
      });
      io.to(`chat:${msg.chatId}`).emit('message:edited', updated);
    });

    // --- Видалення (автором) ---
    socket.on('message:delete', async ({ messageId }) => {
      const msg = await prisma.message.findUnique({ where: { id: messageId } });
      if (!msg || msg.authorId !== userId) return;
      await prisma.message.update({ where: { id: messageId }, data: { isDeleted: true, content: null } });
      io.to(`chat:${msg.chatId}`).emit('message:deleted', { id: messageId, chatId: msg.chatId });
    });

    // --- Закріплення ---
    socket.on('message:pin', async ({ messageId, pinned }) => {
      const msg = await prisma.message.update({ where: { id: messageId }, data: { isPinned: pinned } });
      io.to(`chat:${msg.chatId}`).emit('message:pinned', { id: messageId, isPinned: pinned });
    });

    // --- Реакції (toggle) ---
    socket.on('message:react', async ({ messageId, emoji }) => {
      const msg = await prisma.message.findUnique({ where: { id: messageId } });
      if (!msg) return;

      const existing = await prisma.reaction.findUnique({
        where: { messageId_userId_emoji: { messageId, userId, emoji } },
      });
      if (existing) {
        await prisma.reaction.delete({ where: { id: existing.id } });
      } else {
        await prisma.reaction.create({ data: { messageId, userId, emoji } });
      }
      const reactions = await prisma.reaction.findMany({ where: { messageId } });
      io.to(`chat:${msg.chatId}`).emit('message:reaction_updated', { messageId, reactions });
    });

    // --- Доставлено / прочитано ---
    socket.on('message:delivered', async ({ messageId }) => {
      await prisma.readReceipt.upsert({
        where: { messageId_userId: { messageId, userId } },
        create: { messageId, userId, deliveredAt: new Date() },
        update: { deliveredAt: new Date() },
      });
      const msg = await prisma.message.findUnique({ where: { id: messageId } });
      io.to(`chat:${msg.chatId}`).emit('message:delivered', { messageId, userId });
    });

    socket.on('message:read', async ({ chatId, messageId }) => {
      await prisma.readReceipt.upsert({
        where: { messageId_userId: { messageId, userId } },
        create: { messageId, userId, readAt: new Date() },
        update: { readAt: new Date() },
      });
      io.to(`chat:${chatId}`).emit('message:read', { messageId, userId });
    });

    // --- Індикатор "друкує..." ---
    socket.on('typing:start', ({ chatId }) => {
      socket.to(`chat:${chatId}`).emit('typing:start', { chatId, userId });
    });
    socket.on('typing:stop', ({ chatId }) => {
      socket.to(`chat:${chatId}`).emit('typing:stop', { chatId, userId });
    });

    // --- Дзвінки (WebRTC-сигналінг: сервер лише передає повідомлення,
    // сам голос/відео йде напряму між клієнтами через P2P-з'єднання) ---
    socket.on('call:invite', async ({ chatId, callType }) => {
      // callType: 'audio' | 'video'
      const membership = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId, userId } },
      });
      if (!membership) return;
      socket.to(`chat:${chatId}`).emit('call:invite', {
        chatId,
        callType,
        fromUserId: userId,
        fromNickname: socket.user.nickname,
      });
    });

    socket.on('call:accept', ({ chatId, toUserId }) => {
      io.to(`user:${toUserId}`).emit('call:accept', { chatId, fromUserId: userId });
    });

    socket.on('call:reject', ({ chatId, toUserId }) => {
      io.to(`user:${toUserId}`).emit('call:reject', { chatId, fromUserId: userId });
    });

    socket.on('call:end', ({ chatId, toUserId }) => {
      io.to(`user:${toUserId}`).emit('call:end', { chatId, fromUserId: userId });
    });

    // WebRTC-обмін технічними даними для встановлення прямого з'єднання
    socket.on('call:signal', ({ toUserId, signal }) => {
      io.to(`user:${toUserId}`).emit('call:signal', { fromUserId: userId, signal });
    });

    // --- Відключення ---
    socket.on('disconnect', async () => {
      const sockets = onlineUsers.get(userId);
      sockets?.delete(socket.id);
      if (!sockets || sockets.size === 0) {
        onlineUsers.delete(userId);
        await prisma.user.update({
          where: { id: userId },
          data: { presence: 'OFFLINE', lastSeenAt: new Date() },
        });
        io.emit('presence:update', { userId, presence: 'OFFLINE' });
      }
    });
  });
}

module.exports = { registerSocketHandlers };
