const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');
const ctrl = require('../controllers/notificationController');

router.get('/',             protect, ctrl.list);
router.get('/unread-count', protect, ctrl.unreadCount);
router.put('/read-all',     protect, ctrl.readAll);
router.delete('/',          protect, ctrl.deleteAll);
router.delete('/:id',       protect, ctrl.deleteOne);
router.put('/:id/read',         protect, ctrl.readOne);
router.post('/:id/claim-gift',  protect, ctrl.claimGift);

module.exports = router;
