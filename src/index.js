require('dotenv').config();
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const express = require('express');
const compression = require('compression');
const { Server } = require('socket.io');

const {
  helmetMiddleware,
  corsMiddleware,
  globalLimiter,
  sanitizeBody,
} = require('./middleware/security');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { registerSocketHandlers } = require('./sockets');
const { startMediaCleanupJob } = require('./utils/mediaCleanup');

const app = express();

// Render (і більшість хмарних хостингів) працюють через reverse proxy —
// без цього express-rate-limit не може коректно визначити IP користувача
app.set('trust proxy', 1);

// --- Безпека та базові middleware ---
app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(sanitizeBody);
app.use(globalLimiter);

// --- Статика для завантажених файлів (аватари, медіа) ---
const uploadDir = process.env.UPLOAD_DIR || './uploads';
app.use('/uploads', express.static(path.resolve(uploadDir)));

// --- Роути ---
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/friends', require('./routes/friends'));
app.use('/api/chats', require('./routes/chats'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/push', require('./routes/push'));
app.use('/api/admin', require('./routes/admin'));

app.use(notFound);
app.use(errorHandler);

// --- HTTP чи HTTPS сервер, залежно від наявності сертифікатів ---
const PORT = process.env.PORT || 4000;
let server;
if (process.env.SSL_KEY_PATH && process.env.SSL_CERT_PATH) {
  const options = {
    key: fs.readFileSync(process.env.SSL_KEY_PATH),
    cert: fs.readFileSync(process.env.SSL_CERT_PATH),
  };
  server = https.createServer(options, app);
} else {
  // У dev / за reverse-proxy (nginx з TLS-термінацією) — звичайний HTTP усередині мережі
  server = http.createServer(app);
}

// --- Socket.IO ---
const allowedOrigins = (process.env.CLIENT_ORIGINS || '').split(',').map((s) => s.trim());
const io = new Server(server, {
  cors: { origin: allowedOrigins, credentials: true },
  maxHttpBufferSize: 1e7,
});
app.set('io', io);
registerSocketHandlers(io);

server.listen(PORT, () => {
  console.log(`✅ Taras Messenger server running on port ${PORT} (${process.env.SSL_KEY_PATH ? 'HTTPS' : 'HTTP'})`);
  startMediaCleanupJob();
});

process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));
