const router = require('express').Router();
const ctrl = require('../controllers/adminController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth, requireRole('ADMIN', 'MODERATOR'));

router.post('/users/:userId/ban', ctrl.banUser);
router.post('/users/:userId/unban', ctrl.unbanUser);
router.delete('/users/:userId', requireRole('ADMIN'), ctrl.deleteAccount);
router.delete('/messages/:messageId', ctrl.deleteMessage);
router.get('/stats', ctrl.stats);
router.get('/logs', ctrl.logs);

module.exports = router;
