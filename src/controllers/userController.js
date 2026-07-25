const prisma = require('../config/prisma');
const { sanitizeText } = require('../middleware/security');
const { publicUser } = require('./authController');

const USERNAME_REGEX = /^[a-z0-9_]{3,32}$/;

function normalizeUsername(raw) {
  return String(raw || '').trim().replace(/^@/, '').toLowerCase();
}

async function getMe(req, res) {
  res.json({ user: publicUser(req.user) });
}

// Перевірка доступності @username у реальному часі (для UI під час набору)
async function checkUsernameAvailable(req, res, next) {
  try {
    const username = normalizeUsername(req.query.username);
    if (!USERNAME_REGEX.test(username)) {
      return res.json({ available: false, reason: 'Лише латиниця, цифри, підкреслення, 3-32 символи' });
    }
    const existing = await prisma.user.findUnique({ where: { username } });
    const available = !existing || existing.id === req.user.id;
    res.json({ available, reason: available ? null : 'Юзернейм уже зайнятий' });
  } catch (err) {
    next(err);
  }
}

async function updateProfile(req, res, next) {
  try {
    const { nickname, statusText, avatarUrl, username } = req.body;
    const data = {};
    if (nickname) data.nickname = sanitizeText(nickname).slice(0, 32);
    if (statusText !== undefined) data.statusText = sanitizeText(statusText).slice(0, 140);

    if (username !== undefined) {
      if (username === null || username === '') {
        data.username = null;
      } else {
        const clean = normalizeUsername(username);
        if (!USERNAME_REGEX.test(clean)) {
          return res.status(400).json({ error: 'Юзернейм: лише латиниця, цифри, підкреслення, 3-32 символи' });
        }
        const taken = await prisma.user.findUnique({ where: { username: clean } });
        if (taken && taken.id !== req.user.id) {
          return res.status(409).json({ error: 'Юзернейм уже зайнятий' });
        }
        data.username = clean;
      }
    }

    // Аватар зберігається як base64 (data:) напряму в базі даних —
    // на відміну від /uploads на диску, дані в PostgreSQL не стираються
    // при кожному передеплої безкоштовного Render.
    if (avatarUrl !== undefined) {
      if (avatarUrl === null || avatarUrl === '') {
        data.avatarUrl = null;
      } else if (avatarUrl.startsWith('data:image/') && avatarUrl.length < 500_000) {
        data.avatarUrl = avatarUrl;
      } else {
        return res.status(400).json({ error: 'Некоректне зображення аватара (завелике або неправильний формат)' });
      }
    }

    const user = await prisma.user.update({ where: { id: req.user.id }, data });
    res.json({ user: publicUser(user) });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Юзернейм уже зайнятий' });
    }
    next(err);
  }
}

async function searchUsers(req, res, next) {
  try {
    const rawQ = String(req.query.q || '').trim();
    const q = sanitizeText(rawQ);
    if (q.length < 2) return res.json({ users: [] });

    // Якщо шукають з @ — це явний пошук саме по юзернейму
    const isUsernameSearch = q.startsWith('@');
    const cleanQ = normalizeUsername(q);

    const users = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: req.user.id } },
          { isBanned: false },
          isUsernameSearch
            ? { username: { contains: cleanQ, mode: 'insensitive' } }
            : {
                OR: [
                  { nickname: { contains: q, mode: 'insensitive' } },
                  { username: { contains: cleanQ, mode: 'insensitive' } },
                  { email: { contains: q, mode: 'insensitive' } },
                ],
              },
        ],
      },
      take: 20,
      select: { id: true, nickname: true, username: true, avatarUrl: true, statusText: true, presence: true },
    });
    res.json({ users });
  } catch (err) {
    next(err);
  }
}

// Публічний профіль будь-якого користувача (для перегляду картки друга/учасника чату) —
// email навмисно не повертаємо, це приватна інформація власника акаунта
async function getUserProfile(req, res, next) {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
    if (!user || user.isBanned) return res.status(404).json({ error: 'Користувача не знайдено' });

    res.json({
      user: {
        id: user.id,
        nickname: user.nickname,
        username: user.username,
        avatarUrl: user.avatarUrl,
        statusText: user.statusText,
        presence: user.presence,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getMe, updateProfile, searchUsers, checkUsernameAvailable, getUserProfile };
