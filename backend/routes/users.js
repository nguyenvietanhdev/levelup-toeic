const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');

const {
    getAllUsers,
    getUserById,
    createUser,
    updateUser,
    deleteUser,
} = require('../controllers/userControllerMongo');

// Read — admin only
router.get('/',    protect, authorize('admin'), getAllUsers);
router.get('/:id', protect, authorize('admin'), getUserById);

// Write — admin only
router.post('/',    protect, authorize('admin'), createUser);
router.put('/:id',  protect, authorize('admin'), updateUser);
router.delete('/:id', protect, authorize('admin'), deleteUser);

module.exports = router;
