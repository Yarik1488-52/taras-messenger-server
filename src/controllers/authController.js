const prisma = require('../config/prisma');
const { hashPassword, verifyPassword } = require('../utils/password');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { registerSchema, loginSchema, changePasswordSchema } = require('../utils/validation');
const { sanitizeText } = require('../middleware/security');
const otpStore = require('../utils/otpStore');
const { sendLoginCode } = require('../utils/mailer');

function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    nickname: u.nickname,
    username: u.username,
    avatarUrl: u.avatarUrl,
    statusText: u.statusText,
    presence: u.presence,
    role: u.role,
    createdAt: u.createdAt,
  };
}

async function register(req, res, next) {
  try {
    const data = registerSchema.parse(req.body);
    const nickname = sanitizeText(data.nickname);

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email: data.email }, { nickname }] },
    });
    if (existing) {
      return res.status(409).json({ error: 'Email або нікнейм вже використовується' });
    }

    const passwordHash = await hashPassword(data.password);
    const user = await prisma.user.create({
      data: { email: data.email, nickname, passwordHash, presence: 'ONLINE' },
    });

    const accessToken = signAccessToken({ sub: user.id, role: user.role });
    const refreshToken = signRefreshToken({ sub: user.id });

    res.status(201).json({ user: publicUser(user), accessToken, refreshToken });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const data = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: data.email } });

    // Однакова відповідь для "нема юзера" і "невірний пароль" — щоб не розкривати,
    // чи існує акаунт (захист від enumeration-атак)
    if (!user || !(await verifyPassword(user.passwordHash, data.password))) {
      return res.status(401).json({ error: 'Невірний email або пароль' });
    }
    if (user.isBanned) {
      return res.status(403).json({ error: 'Акаунт заблоковано', reason: user.banReason });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { presence: 'ONLINE', lastSeenAt: new Date() },
    });

    const accessToken = signAccessToken({ sub: user.id, role: user.role });
    const refreshToken = signRefreshToken({ sub: user.id });

    res.json({ user: publicUser(user), accessToken, refreshToken });
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'refreshToken обовʼязковий' });

    const payload = verifyRefreshToken(refreshToken);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.isBanned) return res.status(401).json({ error: 'Недійсний токен' });

    const accessToken = signAccessToken({ sub: user.id, role: user.role });
    res.json({ accessToken });
  } catch {
    res.status(401).json({ error: 'Недійсний або прострочений refresh-токен' });
  }
}

async function changePassword(req, res, next) {
  try {
    const data = changePasswordSchema.parse(req.body);
    const user = req.user;

    const ok = await verifyPassword(user.passwordHash, data.oldPassword);
    if (!ok) return res.status(401).json({ error: 'Старий пароль невірний' });

    const passwordHash = await hashPassword(data.newPassword);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

    res.json({ message: 'Пароль успішно змінено' });
  } catch (err) {
    next(err);
  }
}

async function logout(req, res) {
  await prisma.user.update({
    where: { id: req.user.id },
    data: { presence: 'OFFLINE', lastSeenAt: new Date() },
  });
  res.json({ message: 'Вихід виконано' });
}

// --- Вхід/реєстрація через одноразовий код на email (альтернатива паролю) ---

async function requestEmailCode(req, res, next) {
  try {
    const { email } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Некоректний email' });
    }

    const code = otpStore.issueCode(email);
    await sendLoginCode(email, code);

    const existing = await prisma.user.findUnique({ where: { email } });
    res.json({ message: 'Код надіслано на пошту', isNewUser: !existing });
  } catch (err) {
    next(err);
  }
}

async function verifyEmailCode(req, res, next) {
  try {
    const { email, code, nickname } = req.body;
    if (!email || !code) return res.status(400).json({ error: 'email і code обовʼязкові' });

    // Перевіряємо код, але поки НЕ видаляємо — для нового користувача
    // знадобиться ввести ще й нікнейм, і тоді код перевіриться вдруге
    const result = otpStore.checkCode(email, code);
    if (!result.ok) return res.status(400).json({ error: result.reason });

    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      // Новий користувач — потрібен нікнейм для завершення реєстрації.
      // Код лишається дійсним, доки не прийде фінальний запит із нікнеймом.
      if (!nickname) {
        return res.status(200).json({ needNickname: true });
      }
      const cleanNickname = sanitizeText(nickname).slice(0, 32);
      const nicknameTaken = await prisma.user.findUnique({ where: { nickname: cleanNickname } });
      if (nicknameTaken) return res.status(409).json({ error: 'Цей нікнейм вже зайнятий' });

      const randomPassword = require('crypto').randomBytes(32).toString('hex');
      const passwordHash = await hashPassword(randomPassword);

      user = await prisma.user.create({
        data: { email, nickname: cleanNickname, passwordHash, presence: 'ONLINE' },
      });
    } else {
      if (user.isBanned) return res.status(403).json({ error: 'Акаунт заблоковано', reason: user.banReason });
      await prisma.user.update({ where: { id: user.id }, data: { presence: 'ONLINE', lastSeenAt: new Date() } });
    }

    otpStore.consumeCode(email); // усе успішно завершилось — тепер код більше не дійсний

    const accessToken = signAccessToken({ sub: user.id, role: user.role });
    const refreshToken = signRefreshToken({ sub: user.id });

    res.json({ user: publicUser(user), accessToken, refreshToken });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, refresh, changePassword, logout, publicUser, requestEmailCode, verifyEmailCode };
