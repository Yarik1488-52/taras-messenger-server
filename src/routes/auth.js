const router = require('express').Router();
const ctrl = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');
const { authLimiter } = require('../middleware/security');

router.post('/register', authLimiter, ctrl.register);
router.post('/login', authLimiter, ctrl.login);
router.post('/refresh', authLimiter, ctrl.refresh);
router.post('/request-email-code', authLimiter, ctrl.requestEmailCode);
router.post('/verify-email-code', authLimiter, ctrl.verifyEmailCode);
router.post('/request-password-reset', authLimiter, ctrl.requestPasswordReset);
router.post('/reset-password', authLimiter, ctrl.resetPassword);
router.post('/change-password', requireAuth, ctrl.changePassword);
router.post('/logout', requireAuth, ctrl.logout);

module.exports = router;
