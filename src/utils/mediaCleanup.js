const cloudinary = require('cloudinary').v2;
const prisma = require('../config/prisma');

const MEDIA_TYPES = ['IMAGE', 'VIDEO', 'VOICE', 'GIF', 'FILE'];
const RETENTION_DAYS = 7;

// Витягує public_id із Cloudinary-URL, щоб видалити файл із самого сховища
// (просто видалити рядок з бази недостатньо — файл продовжив би займати місце)
function extractPublicId(url) {
  const match = url?.match(/\/taras-messenger\/([^./]+)/);
  return match ? `taras-messenger/${match[1]}` : null;
}

async function cleanupOldMedia() {
  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const oldMessages = await prisma.message.findMany({
      where: {
        type: { in: MEDIA_TYPES },
        createdAt: { lt: cutoff },
        isDeleted: false,
        content: { not: null },
      },
      select: { id: true, content: true, chatId: true },
    });

    if (oldMessages.length === 0) return;

    for (const msg of oldMessages) {
      const publicId = extractPublicId(msg.content);
      if (publicId) {
        await cloudinary.uploader.destroy(publicId, { resource_type: 'auto' }).catch(() => {});
      }
    }

    const ids = oldMessages.map((m) => m.id);
    await prisma.message.updateMany({
      where: { id: { in: ids } },
      data: { content: null, isDeleted: true },
    });

    console.log(`🧹 Видалено ${oldMessages.length} застарілих медіа-файлів (старші ${RETENTION_DAYS} днів)`);
  } catch (err) {
    console.error('Помилка очищення старих медіа:', err.message);
  }
}

// Запускаємо раз на добу. Перший запуск — через 5 хв після старту сервера
// (не одразу, щоб не заважати старту процесу)
function startMediaCleanupJob() {
  setTimeout(cleanupOldMedia, 5 * 60 * 1000);
  setInterval(cleanupOldMedia, 24 * 60 * 60 * 1000);
}

module.exports = { startMediaCleanupJob, cleanupOldMedia };
