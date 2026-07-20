const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const prisma = require('../config/prisma');

// Клієнт (браузер/Electron) надсилає сюди свою Push-підписку один раз
// після дозволу на сповіщення — далі сервер знає, куди штовхати офлайн-сповіщення
router.post('/subscribe', requireAuth, async (req, res, next) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys) return res.status(400).json({ error: 'Некоректна підписка' });

    const sub = await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId: req.user.id, endpoint, keys },
      update: { keys },
    });
    res.status(201).json({ subscription: sub });
  } catch (err) {
    next(err);
  }
});

router.post('/unsubscribe', requireAuth, async (req, res, next) => {
  try {
    const { endpoint } = req.body;
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.user.id } });
    res.json({ message: 'Відписано' });
  } catch (err) {
    next(err);
  }
});

// Публічний VAPID-ключ, потрібен клієнту для оформлення підписки
router.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
});

module.exports = router;
