const prisma = require('../config/prisma');

async function sendRequest(req, res, next) {
  try {
    const { userId } = req.body;
    if (userId === req.user.id) return res.status(400).json({ error: 'Не можна додати себе' });

    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) return res.status(404).json({ error: 'Користувача не знайдено' });

    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { senderId: req.user.id, receiverId: userId },
          { senderId: userId, receiverId: req.user.id },
        ],
      },
    });
    if (existing) return res.status(409).json({ error: 'Запит вже існує або ви вже друзі' });

    const friendship = await prisma.friendship.create({
      data: { senderId: req.user.id, receiverId: userId, status: 'PENDING' },
    });
    res.status(201).json({ friendship });
  } catch (err) {
    next(err);
  }
}

async function respondRequest(req, res, next) {
  try {
    const { id } = req.params; // friendship id
    const { accept } = req.body;

    const friendship = await prisma.friendship.findUnique({ where: { id } });
    if (!friendship || friendship.receiverId !== req.user.id) {
      return res.status(404).json({ error: 'Запит не знайдено' });
    }

    if (!accept) {
      await prisma.friendship.delete({ where: { id } });
      return res.json({ message: 'Запит відхилено' });
    }

    const updated = await prisma.friendship.update({
      where: { id },
      data: { status: 'ACCEPTED' },
    });
    res.json({ friendship: updated });
  } catch (err) {
    next(err);
  }
}

async function listFriends(req, res, next) {
  try {
    const rows = await prisma.friendship.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ senderId: req.user.id }, { receiverId: req.user.id }],
      },
      include: { sender: true, receiver: true },
    });

    const friends = rows.map((r) => {
      const other = r.senderId === req.user.id ? r.receiver : r.sender;
      return {
        friendshipId: r.id,
        id: other.id,
        nickname: other.nickname,
        avatarUrl: other.avatarUrl,
        presence: other.presence,
        statusText: other.statusText,
      };
    });
    res.json({ friends });
  } catch (err) {
    next(err);
  }
}

async function removeFriend(req, res, next) {
  try {
    const { id } = req.params;
    const friendship = await prisma.friendship.findUnique({ where: { id } });
    if (!friendship) return res.status(404).json({ error: 'Не знайдено' });
    if (![friendship.senderId, friendship.receiverId].includes(req.user.id)) {
      return res.status(403).json({ error: 'Немає доступу' });
    }
    await prisma.friendship.delete({ where: { id } });
    res.json({ message: 'Видалено з друзів' });
  } catch (err) {
    next(err);
  }
}

async function listIncomingRequests(req, res, next) {
  try {
    const rows = await prisma.friendship.findMany({
      where: { receiverId: req.user.id, status: 'PENDING' },
      include: { sender: { select: { id: true, nickname: true, avatarUrl: true, statusText: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ requests: rows.map((r) => ({ friendshipId: r.id, ...r.sender, createdAt: r.createdAt })) });
  } catch (err) {
    next(err);
  }
}

// Заблокувати користувача: заблокований більше не може писати/дзвонити.
// Якщо запису дружби ще не було — створюємо одразу зі статусом BLOCKED.
async function blockUser(req, res, next) {
  try {
    const { userId } = req.body;
    if (userId === req.user.id) return res.status(400).json({ error: 'Не можна заблокувати себе' });

    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { senderId: req.user.id, receiverId: userId },
          { senderId: userId, receiverId: req.user.id },
        ],
      },
    });

    if (existing) {
      await prisma.friendship.update({
        where: { id: existing.id },
        data: { status: 'BLOCKED', senderId: req.user.id, receiverId: userId },
      });
    } else {
      await prisma.friendship.create({
        data: { senderId: req.user.id, receiverId: userId, status: 'BLOCKED' },
      });
    }
    res.json({ message: 'Користувача заблоковано' });
  } catch (err) {
    next(err);
  }
}

async function unblockUser(req, res, next) {
  try {
    const { userId } = req.body;
    await prisma.friendship.deleteMany({
      where: {
        status: 'BLOCKED',
        senderId: req.user.id,
        receiverId: userId,
      },
    });
    res.json({ message: 'Розблоковано' });
  } catch (err) {
    next(err);
  }
}

// Скарга на користувача — записується в AuditLog, адміни бачать через /admin/logs
async function reportUser(req, res, next) {
  try {
    const { userId, reason } = req.body;
    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        action: 'USER_REPORTED',
        targetId: userId,
        meta: { reason: reason?.slice(0, 500) || 'Без причини' },
      },
    });
    res.status(201).json({ message: 'Скаргу надіслано' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  sendRequest,
  respondRequest,
  listFriends,
  removeFriend,
  listIncomingRequests,
  blockUser,
  unblockUser,
  reportUser,
};
