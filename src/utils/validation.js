const { z } = require('zod');

// Zod даю подвійний захист: некоректні/шкідливі дані відсіюються ще
// до потрапляння у Prisma-запити (додатково до параметризації Prisma,
// яка сама по собі захищає від SQL-ін'єкцій).

const registerSchema = z.object({
  email: z.string().email().max(254),
  nickname: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/, 'Нікнейм: лише латиниця, цифри, підкреслення'),
  password: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Z]/, 'Потрібна хоча б одна велика літера')
    .regex(/[0-9]/, 'Потрібна хоча б одна цифра'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1).max(128),
  newPassword: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Z]/)
    .regex(/[0-9]/),
});

const messageSendSchema = z.object({
  chatId: z.string().uuid(),
  type: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'FILE', 'VOICE', 'GIF', 'STICKER']),
  content: z.string().max(4000).optional(),
  fileMeta: z.record(z.any()).optional(),
  replyToId: z.string().uuid().optional().nullable(),
});

module.exports = {
  registerSchema,
  loginSchema,
  changePasswordSchema,
  messageSendSchema,
};
