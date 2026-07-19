const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss');

// --- HTTPS/заголовки безпеки ---
const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      mediaSrc: ["'self'", 'blob:'],
      connectSrc: ["'self'", 'wss:', 'https:'],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});

// --- CORS: лише дозволені origin (десктоп/андроїд-клієнти) ---
const allowedOrigins = (process.env.CLIENT_ORIGINS || '').split(',').map((s) => s.trim());
const corsMiddleware = cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Заборонено CORS-політикою'));
  },
  credentials: true,
});

// --- Загальний rate limit проти брутфорсу/DDoS ---
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Забагато запитів, спробуйте пізніше' },
});

// --- Жорсткіший ліміт на auth-роути (захист від brute-force паролів) ---
const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Забагато спроб входу, зачекайте 10 хвилин' },
});

// --- Захист від спаму повідомлень (окремо застосовується у socket-шарі) ---
const messageRateMap = new Map(); // userId -> timestamps[]
function isSpamming(userId, limit = 15, windowMs = 10_000) {
  const now = Date.now();
  const arr = (messageRateMap.get(userId) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  messageRateMap.set(userId, arr);
  return arr.length > limit;
}

// --- Санітизація рядків від XSS (для контенту, що рендериться як HTML/markdown) ---
function sanitizeText(input) {
  if (typeof input !== 'string') return input;
  return xss(input, {
    whiteList: {}, // жодних HTML-тегів у повідомленнях
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script', 'style'],
  });
}

// --- Санітизація тіла запиту від NoSQL/prototype-pollution патернів ---
const sanitizeBody = mongoSanitize();

module.exports = {
  helmetMiddleware,
  corsMiddleware,
  globalLimiter,
  authLimiter,
  isSpamming,
  sanitizeText,
  sanitizeBody,
};
