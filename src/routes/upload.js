const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { uploadBuffer, ensureConfigured } = require('../utils/cloudStorage');

// Універсальний ендпоінт для фото/відео/файлів/голосових у чаті.
// Файл більше не лягає на диск Render (який стирається при кожному
// перезапуску) — одразу йде в Cloudinary, постійне безкоштовне сховище.
router.post('/', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не передано' });

  if (!ensureConfigured()) {
    return res.status(503).json({
      error: 'Сховище файлів ще не налаштоване на сервері (CLOUDINARY_* змінні відсутні)',
    });
  }

  try {
    const result = await uploadBuffer(req.file.buffer, req.file.originalname);
    res.status(201).json({
      url: result.secure_url, // постійне посилання, не зникає при перезапуску
      name: req.file.originalname,
      size: req.file.size,
      mime: req.file.mimetype,
    });
  } catch (err) {
    console.error('Cloudinary upload error:', err.message);
    res.status(500).json({ error: 'Не вдалося завантажити файл у сховище' });
  }
});

module.exports = router;
