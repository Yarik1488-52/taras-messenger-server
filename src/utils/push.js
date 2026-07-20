const webpush = require('web-push');
const prisma = require('../config/prisma');

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:admin@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    configured = true;
  }
}

// Викликається при новому повідомленні, якщо отримувач зараз офлайн —
// надсилає системне сповіщення (як у Telegram, коли застосунок закритий/згорнутий)
async function notifyOfflineRecipients({ chatId, senderId, senderNickname, preview }) {
  ensureConfigured();
  if (!configured) return; // VAPID-ключі не задані — пропускаємо тихо, без падіння сервера

  const members = await prisma.chatMember.findMany({
    where: { chatId, userId: { not: senderId } },
    include: { user: { include: { pushSubscriptions: true } } },
  });

  const payload = JSON.stringify({
    title: senderNickname,
    body: preview?.slice(0, 120) || 'Нове повідомлення',
    chatId,
  });

  for (const member of members) {
    // Сповіщаємо лише тих, хто зараз офлайн — онлайн-користувачі й так
    // бачать повідомлення миттєво через сокет, дублювати не потрібно
    if (member.user.presence === 'ONLINE') continue;

    for (const sub of member.user.pushSubscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          payload
        );
      } catch (err) {
        // Підписка застаріла (410 Gone) — видаляємо її з бази
        if (err.statusCode === 410 || err.statusCode === 404) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
      }
    }
  }
}

module.exports = { notifyOfflineRecipients };
