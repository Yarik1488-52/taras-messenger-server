const prisma = require('../config/prisma');
const { sanitizeText } = require('../middleware/security');

// Приватний чат: створюється (або повертається існуючий) між двома юзерами
async function getOrCreatePrivateChat(req, res, next) {
  try {
    const { userId } = req.body;
    const meId = req.user.id;

    const existing = await prisma.chat.findFirst({
      where: {
        type: 'PRIVATE',
        AND: [
          { members: { some: { userId: meId } } },
          { members: { some: { userId } } },
        ],
      },
      include: { members: true },
    });
    if (existing) return res.json({ chat: existing });

    const chat = await prisma.chat.create({
      data: {
        type: 'PRIVATE',
        members: { create: [{ userId: meId, role: 'MEMBER' }, { userId, role: 'MEMBER' }] },
      },
      include: { members: true },
    });
    res.status(201).json({ chat });
  } catch (err) {
    next(err);
  }
}

async function createGroupOrChannel(req, res, next) {
  try {
    const { name, type, memberIds = [] } = req.body; // type: GROUP | CHANNEL
    if (!['GROUP', 'CHANNEL'].includes(type)) {
      return res.status(400).json({ error: 'Тип має бути GROUP або CHANNEL' });
    }
    const cleanName = sanitizeText(name).slice(0, 64);

    const chat = await prisma.chat.create({
      data: {
        type,
        name: cleanName,
        members: {
          create: [
            { userId: req.user.id, role: 'OWNER' },
            ...memberIds.filter((id) => id !== req.user.id).map((id) => ({ userId: id, role: 'MEMBER' })),
          ],
        },
      },
      include: { members: true },
    });
    res.status(201).json({ chat });
  } catch (err) {
    next(err);
  }
}

async function listMyChats(req, res, next) {
  try {
    const chats = await prisma.chat.findMany({
      where: { members: { some: { userId: req.user.id } } },
      include: {
        members: { include: { user: { select: { id: true, nickname: true, avatarUrl: true, presence: true } } } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ chats });
  } catch (err) {
    next(err);
  }
}

async function addMember(req, res, next) {
  try {
    const { chatId } = req.params;
    const { userId } = req.body;

    const membership = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.user.id } },
    });
    if (!membership || membership.role === 'MEMBER') {
      return res.status(403).json({ error: 'Лише адмін/власник може додавати учасників' });
    }

    const member = await prisma.chatMember.create({ data: { chatId, userId } });
    res.status(201).json({ member });
  } catch (err) {
    next(err);
  }
}

module.exports = { getOrCreatePrivateChat, createGroupOrChannel, listMyChats, addMember };
