const { verifyAccessToken } = require('../utils/jwt');
const prisma = require('../config/prisma');

async function socketAuthMiddleware(socket, next) {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Токен відсутній'));

    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return next(new Error('Користувача не знайдено'));
    if (user.isBanned) return next(new Error('Акаунт заблоковано'));

    socket.userId = user.id;
    socket.user = user;
    next();
  } catch {
    next(new Error('Недійсний токен'));
  }
}

module.exports = socketAuthMiddleware;
