const router = require('express').Router();
const ctrl = require('../controllers/userController');
const { requireAuth } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.get('/me', requireAuth, ctrl.getMe);
router.patch('/me', requireAuth, ctrl.updateProfile);
router.post('/me/avatar', requireAuth, upload.single('avatar'), ctrl.updateAvatar);
router.get('/search', requireAuth, ctrl.searchUsers);

module.exports = router;
