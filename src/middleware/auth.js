const { verifyAccessToken } = require('../utils/jwt');
const prisma = require('../config/prisma');

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Токен відсутній' });

    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });

    if (!user) return res.status(401).json({ error: 'Користувача не знайдено' });
    if (user.isBanned) return res.status(403).json({ error: 'Акаунт заблоковано', reason: user.banReason });

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Недійсний або прострочений токен' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Недостатньо прав' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
