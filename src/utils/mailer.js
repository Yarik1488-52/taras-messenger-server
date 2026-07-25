const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 465,
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS, // Gmail App Password, не звичайний пароль акаунта
    },
  });
  return transporter;
}

async function sendLoginCode(toEmail, code) {
  const t = getTransporter();
  if (!t) {
    // Немає SMTP-налаштувань — не падаємо, просто повідомляємо в лог
    // (корисно для розробки, коли ще не налаштований Gmail App Password)
    console.warn(`[EMAIL DISABLED] Код для ${toEmail}: ${code}`);
    return;
  }
  await t.sendMail({
    from: `"Taras Messenger" <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject: `${code} — код входу в Taras Messenger`,
    text: `Ваш код для входу: ${code}\n\nКод дійсний 10 хвилин. Якщо ви не запитували вхід — просто ігноруйте цей лист.`,
    html: `
      <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto;">
        <h2 style="color:#4f7cff;">Taras Messenger</h2>
        <p>Ваш код для входу:</p>
        <div style="font-size:32px; font-weight:800; letter-spacing:6px; color:#4f7cff;">${code}</div>
        <p style="color:#888; font-size:13px;">Код дійсний 10 хвилин. Якщо ви не запитували вхід — ігноруйте цей лист.</p>
      </div>
    `,
  });
}

module.exports = { sendLoginCode };
