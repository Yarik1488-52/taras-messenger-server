const prisma = require('../config/prisma');
const { sanitizeText } = require('../middleware/security');
const { publicUser } = require('./authController');

async function getMe(req, res) {
  res.json({ user: publicUser(req.user) });
}

async function updateProfile(req, res, next) {
  try {
    const { nickname, statusText } = req.body;
    const data = {};
    if (nickname) data.nickname = sanitizeText(nickname).slice(0, 32);
    if (statusText !== undefined) data.statusText = sanitizeText(statusText).slice(0, 140);

    const user = await prisma.user.update({ where: { id: req.user.id }, data });
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
}

// Файл вже збережено multer-middleware у /uploads, тут лише прив'язуємо URL
async function updateAvatar(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ error: 'Файл аватара не передано' });
    const avatarUrl = `/uploads/${req.file.filename}`;
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { avatarUrl },
    });
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
}

async function searchUsers(req, res, next) {
  try {
    const q = sanitizeText(String(req.query.q || '')).trim();
    if (q.length < 2) return res.json({ users: [] });

    const users = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: req.user.id } },
          { isBanned: false },
          {
            OR: [
              { nickname: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          },
        ],
      },
      take: 20,
      select: { id: true, nickname: true, avatarUrl: true, statusText: true, presence: true },
    });
    res.json({ users });
  } catch (err) {
    next(err);
  }
}

module.exports = { getMe, updateProfile, updateAvatar, searchUsers };
