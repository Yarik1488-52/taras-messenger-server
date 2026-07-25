// Прості одноразові коди для входу через email — зберігаються в пам'яті
// процесу (не в базі): коди короткоживучі (10 хв), тому втрата при
// перезапуску сервера не критична — людина просто попросить новий код.

const codes = new Map(); // email -> { codeHash, expiresAt, attempts }

const crypto = require('crypto');

function hashCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 цифр
}

function issueCode(email) {
  const code = generateCode();
  codes.set(email, {
    codeHash: hashCode(code),
    expiresAt: Date.now() + 10 * 60 * 1000,
    attempts: 0,
  });
  return code;
}

// Перевіряє код БЕЗ видалення (використовується, коли ще не знаємо,
// чи це фінальна дія — напр. новому юзеру ще треба ввести нікнейм)
function checkCode(email, code) {
  const entry = codes.get(email);
  if (!entry) return { ok: false, reason: 'Код не запитувався або вже прострочений' };
  if (Date.now() > entry.expiresAt) {
    codes.delete(email);
    return { ok: false, reason: 'Код прострочений, запросіть новий' };
  }
  entry.attempts += 1;
  if (entry.attempts > 8) {
    codes.delete(email);
    return { ok: false, reason: 'Забагато спроб, запросіть новий код' };
  }
  if (hashCode(code) !== entry.codeHash) {
    return { ok: false, reason: 'Невірний код' };
  }
  return { ok: true };
}

// Остаточно "спалює" код — викликається лише після успішного
// завершення входу/реєстрації
function consumeCode(email) {
  codes.delete(email);
}

function verifyCode(email, code) {
  const result = checkCode(email, code);
  if (result.ok) consumeCode(email);
  return result;
}

module.exports = { issueCode, verifyCode, checkCode, consumeCode };
