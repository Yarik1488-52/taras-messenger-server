const multer = require('multer');

// Білий список дозволених MIME — захист від завантаження виконуваних файлів
const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/webm', 'video/quicktime',
  'audio/mpeg', 'audio/ogg', 'audio/webm', 'audio/wav',
  'application/pdf', 'application/zip',
  'text/plain', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

// Файли тримаються в пам'яті процесу (не на диску) — диск на Render не
// постійний і стирається при кожному перезапуску. Звідси файл одразу
// йде далі, в постійне хмарне сховище (Cloudinary), див. routes/upload.js
const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    return cb(new Error('Непідтримуваний тип файлу'), false);
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: (Number(process.env.MAX_FILE_SIZE_MB) || 10) * 1024 * 1024 },
});

module.exports = upload;
