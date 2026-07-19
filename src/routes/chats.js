const router = require('express').Router();
const ctrl = require('../controllers/chatController');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, ctrl.listMyChats);
router.post('/private', requireAuth, ctrl.getOrCreatePrivateChat);
router.post('/group', requireAuth, ctrl.createGroupOrChannel);
router.post('/:chatId/members', requireAuth, ctrl.addMember);

module.exports = router;
