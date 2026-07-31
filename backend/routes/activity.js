const express = require('express');
const router = express.Router();
const {
    getActivities,
    clearActivities
} = require('../controllers/activityController');
const { protect, authorize } = require('../middleware/auth');

// GET /api/activities - Get activity logs
// (Vẫn công khai: dashboard đọc để dựng "hoạt động gần đây". Việc log này lộ ra
//  cho người chưa đăng nhập là một finding riêng, chưa xử ở đây.)
router.get('/', getActivities);

// DELETE /api/activities - Clear all activity logs
// Trước đây để trần: xoá ẩn danh chính cái nhật ký dùng để quy trách nhiệm.
// Không có caller nào trong repo — thêm guard không làm hỏng gì.
router.delete('/', protect, authorize('admin'), clearActivities);

module.exports = router;
