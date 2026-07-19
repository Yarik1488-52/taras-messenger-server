const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await argon2.hash('Password123', { type: argon2.argon2id });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@taras.chat' },
    update: {},
    create: {
      email: 'admin@taras.chat',
      nickname: 'admin',
      passwordHash,
      role: 'ADMIN',
      statusText: 'Керую сервером',
    },
  });

  const taras = await prisma.user.upsert({
    where: { email: 'taras@taras.chat' },
    update: {},
    create: {
      email: 'taras@taras.chat',
      nickname: 'taras',
      passwordHash,
      statusText: 'Привіт, я Тарас!',
    },
  });

  const chat = await prisma.chat.create({
    data: {
      type: 'PRIVATE',
      members: { create: [{ userId: admin.id }, { userId: taras.id }] },
    },
  });

  await prisma.message.create({
    data: {
      chatId: chat.id,
      authorId: taras.id,
      type: 'TEXT',
      content: 'Вітаю у Taras Messenger! 🚀',
    },
  });

  console.log('✅ Seed завершено. Тестові акаунти: admin@taras.chat / taras@taras.chat, пароль: Password123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
