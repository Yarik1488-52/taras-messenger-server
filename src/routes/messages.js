const router = require('express').Router();
const ctrl = require('../controllers/messageController');
const { requireAuth } = require('../middleware/auth');

router.get('/:chatId/history', requireAuth, ctrl.getHistory);
router.post('/forward', requireAuth, ctrl.forwardMessage);

module.exports = router;
