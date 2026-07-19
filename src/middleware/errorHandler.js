function notFound(req, res) {
  res.status(404).json({ error: 'Маршрут не знайдено' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err.message);

  if (err.name === 'ZodError') {
    return res.status(400).json({ error: 'Помилка валідації', details: err.errors });
  }
  if (err.code === 'P2002') {
    return res.status(409).json({ error: 'Такий запис вже існує (унікальне поле зайняте)' });
  }

  const status = err.status || 500;
  res.status(status).json({
    error: status === 500 ? 'Внутрішня помилка сервера' : err.message,
  });
}

module.exports = { notFound, errorHandler };
