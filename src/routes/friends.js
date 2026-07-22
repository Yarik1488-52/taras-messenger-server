const router = require('express').Router();
const ctrl = require('../controllers/friendController');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, ctrl.listFriends);
router.get('/requests', requireAuth, ctrl.listIncomingRequests);
router.post('/request', requireAuth, ctrl.sendRequest);
router.post('/request/:id/respond', requireAuth, ctrl.respondRequest);
router.delete('/:id', requireAuth, ctrl.removeFriend);
router.post('/block', requireAuth, ctrl.blockUser);
router.post('/unblock', requireAuth, ctrl.unblockUser);
router.post('/report', requireAuth, ctrl.reportUser);

module.exports = router;
