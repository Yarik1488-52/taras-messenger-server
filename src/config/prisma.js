const { PrismaClient } = require('@prisma/client');

// Singleton, щоб уникнути вичерпання connection pool при hot-reload
const prisma = global.__prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') global.__prisma = prisma;

module.exports = prisma;
