const express = require('express');
const router = express.Router();
const {
  checkPermission,
  uploadVocabulary,
  getMyTopics,
  getExpiringTopics,
  getMyVocabulary,
  deleteMyWord,
  updateMyWord,
  shareSource,
  unshareSource,
  listSharees,
  getSharedTopics,
  getSharedVocabulary,
  copySharedSource,
  getPendingShares,
  acceptShares,
  rejectShare,
  deleteMySource,
  deleteMySourcePart,
  filterDeleteMySource,
  extendMySource,
  getMonitoring,
  adminDeleteUserSource,
  getStats,
} = require('../controllers/uploadController');
const { protect, authorize } = require('../middleware/auth');
const { requireLevel } = require('../services/featureUnlock');
const validate = require('../middleware/validate');
const { vocabUpload } = require('../validators/schemas');

// User routes
router.get('/check', protect, checkPermission);
router.post('/vocabulary', protect, requireLevel('feature:upload-vocab'), validate(vocabUpload), uploadVocabulary);
router.get('/my-topics', protect, getMyTopics);
router.get('/expiring', protect, getExpiringTopics);
router.get('/my-vocabulary/:source', protect, getMyVocabulary);
router.delete('/my-vocabulary/:wordId', protect, deleteMyWord);
// Sửa từ: cùng quyền với xoá (protect + lọc theo ownerEmail trong controller).
router.put('/my-vocabulary/:wordId', protect, updateMyWord);

// Chia sẻ bộ từ cho tài khoản khác. Tất cả đều `protect`: quyền sở hữu được
// kiểm bên trong handler bằng `ownerEmail: req.user.email`, không có middleware
// riêng cho từng tài nguyên (repo này chưa có mô hình đó).
router.post('/share/:source', protect, shareSource);
router.delete('/share/:source/:granteeId', protect, unshareSource);
router.get('/share/:source', protect, listSharees);

// Đường đọc của NGƯỜI ĐƯỢC chia sẻ. Route riêng chứ không nới getMyVocabulary:
// 9 handler kia đang cùng một khuôn `ownerEmail: <người gọi>`, làm một cái thành
// có điều kiện là người viết handler thứ 10 chép nhầm khuôn.
router.get('/shared-topics', protect, getSharedTopics);
router.get('/shared-vocabulary/:ownerEmail/:source', protect, getSharedVocabulary);
router.post('/shared-vocabulary/:ownerEmail/:source/copy', protect, copySharedSource);

// Lời mời chia sẻ CHỜ DUYỆT. Chia sẻ không còn tự đẩy bộ từ vào danh sách
// chọn đề của người nhận — họ phải đồng ý trước.
router.get('/shares/pending', protect, getPendingShares);
router.post('/shares/accept', protect, acceptShares);
router.delete('/shares/pending/:ownerEmail/:source', protect, rejectShare);
router.post('/extend/:source', protect, extendMySource);
// Xóa TRỌN một Part — đặt TRƯỚC `/my-source/:source`.
//
// Express khớp theo thứ tự khai báo, nhưng `/my-source/:source` chỉ có MỘT đoạn
// nên `/my-source/abc/part/BUOI 3` không khớp nó — thứ tự ở đây không bắt buộc
// về mặt kỹ thuật. Vẫn đặt trước để đọc từ hẹp tới rộng, và để nếu sau này ai
// đổi `:source` thành `:source*` (khớp nhiều đoạn) thì không nuốt mất route này.
// Xóa hàng loạt theo điều kiện (AND) — POST vì mang body `filters`.
router.post('/my-source/:source/filter-delete', protect, filterDeleteMySource);
router.delete('/my-source/:source/part/:part', protect, deleteMySourcePart);
router.delete('/my-source/:source', protect, deleteMySource);

// Admin routes
router.get('/admin/monitoring', protect, authorize('admin'), getMonitoring);
// Xóa trọn một nguồn của NGƯỜI KHÁC — chỉ admin. `authorize('admin')` là thứ
// duy nhất ngăn người dùng thường gọi thẳng endpoint này để xóa dữ liệu của nhau.
router.delete('/admin/user-source/:email/:source', protect, authorize('admin'), adminDeleteUserSource);
router.get('/admin/stats', protect, authorize('admin'), getStats);

module.exports = router;
