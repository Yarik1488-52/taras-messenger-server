const router = require('express').Router();
const ctrl = require('../controllers/friendController');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, ctrl.listFriends);
router.post('/request', requireAuth, ctrl.sendRequest);
router.post('/request/:id/respond', requireAuth, ctrl.respondRequest);
router.delete('/:id', requireAuth, ctrl.removeFriend);

module.exports = router;
