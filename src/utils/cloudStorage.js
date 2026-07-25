const cloudinary = require('cloudinary').v2;

let configured = false;

function ensureConfigured() {
  if (configured) return true;
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) return false;

  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
  });
  configured = true;
  return true;
}

// Завантажує буфер файлу (з пам'яті, без диска) у Cloudinary — постійне
// сховище, яке НЕ стирається при перезапуску Render (на відміну від
// локального /uploads). Повертає постійний https-URL файлу.
function uploadBuffer(buffer, originalName) {
  return new Promise((resolve, reject) => {
    if (!ensureConfigured()) {
      return reject(new Error('Сховище файлів не налаштоване (CLOUDINARY_* змінні відсутні)'));
    }
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'auto', // сам визначає: image / video / raw (для голосових, документів)
        folder: 'taras-messenger',
        public_id: undefined, // Cloudinary сам згенерує унікальне ім'я
        use_filename: false,
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );
    stream.end(buffer);
  });
}

module.exports = { uploadBuffer, ensureConfigured };
