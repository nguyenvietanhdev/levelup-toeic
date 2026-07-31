// routes/auth.js
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { uploadAvatar } = require('../middleware/upload');

const otpLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 5,
    message: { success: false, message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau 10 phút.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, message: 'Quá nhiều lần thử đăng nhập. Vui lòng thử lại sau 15 phút.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: { success: false, message: 'Quá nhiều tài khoản được tạo từ IP này. Vui lòng thử lại sau 1 giờ.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const checkLockLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    message: { success: false, message: 'Quá nhiều yêu cầu.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Đăng nhập admin siết chặt hơn user thường: tài khoản admin KHÔNG bị khoá theo
// số lần sai (xem authController.login — nhánh `role !== 'admin'`), nên rate
// limit là lớp chặn duy nhất còn lại. Admin đăng nhập vốn hiếm, 5 lần/15 phút
// là thừa cho người thật.
const adminLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { success: false, message: 'Quá nhiều lần thử đăng nhập. Vui lòng thử lại sau 15 phút.' },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Đăng nhập
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Đăng nhập thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       401:
 *         description: Sai tài khoản / mật khẩu
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/login', loginLimiter, authController.login);
router.post('/google', loginLimiter, authController.googleLogin);
router.post('/admin/login', adminLoginLimiter, authController.login);

/**
 * @swagger
 * /api/auth/check-lock:
 *   post:
 *     tags: [Auth]
 *     summary: Kiểm tra tài khoản có bị khoá không
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [identifier]
 *             properties:
 *               identifier:
 *                 type: string
 *                 example: admin
 *     responses:
 *       200:
 *         description: Trạng thái tài khoản
 */
router.post('/check-lock', checkLockLimiter, authController.checkLock);

/**
 * @swagger
 * /api/auth/send-register-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Gửi OTP xác thực email để đăng ký
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *     responses:
 *       200:
 *         description: OTP đã gửi về email
 *       429:
 *         description: Rate limit — quá nhiều yêu cầu
 */
router.post('/send-register-otp', registerLimiter, authController.sendRegisterOtp);

/**
 * @swagger
 * /api/auth/verify-register-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Xác thực OTP và hoàn tất đăng ký
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp, username, password]
 *             properties:
 *               email:    { type: string, format: email }
 *               otp:      { type: string, example: "123456" }
 *               username: { type: string, example: "john_doe" }
 *               password: { type: string, format: password }
 *     responses:
 *       201:
 *         description: Đăng ký thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: OTP không hợp lệ hoặc đã hết hạn
 */
router.post('/verify-register-otp', otpLimiter, authController.verifyRegisterOtp);

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Đăng ký trực tiếp (không OTP — dành cho admin tools)
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, email, password]
 *             properties:
 *               username: { type: string, example: john_doe }
 *               email:    { type: string, format: email }
 *               password: { type: string, format: password }
 *     responses:
 *       201:
 *         description: Tạo tài khoản thành công
 */
router.post('/register', registerLimiter, authController.register);

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Gửi OTP reset mật khẩu
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200:
 *         description: OTP đã gửi về email
 */
router.post('/forgot-password', otpLimiter, authController.forgotPassword);

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Đặt lại mật khẩu bằng OTP
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp, newPassword]
 *             properties:
 *               email:       { type: string, format: email }
 *               otp:         { type: string, example: "123456" }
 *               newPassword: { type: string, format: password }
 *     responses:
 *       200:
 *         description: Đặt lại mật khẩu thành công
 *       400:
 *         description: OTP không hợp lệ
 */
router.post('/reset-password', otpLimiter, authController.resetPassword);

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Lấy thông tin người dùng hiện tại
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thông tin user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:    { $ref: '#/components/schemas/UserPublic' }
 *       401:
 *         description: Chưa đăng nhập
 */
router.get('/me', protect, authController.getMe);

/**
 * @swagger
 * /api/auth/profile:
 *   put:
 *     tags: [Auth]
 *     summary: Cập nhật thông tin cá nhân
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username: { type: string }
 *               avatar:   { type: string }
 *               email:    { type: string, format: email }
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 */
router.put('/profile', protect, authController.updateProfile);
// Tải avatar riêng đã TẮT (tránh nội dung không kiểm duyệt hiển thị công khai ở BXH).
// Đổi ảnh đại diện: mua & trang bị avatar trong Cửa hàng, hoặc dùng avatar Google.
router.post('/avatar', protect, (req, res) => {
    res.status(403).json({ success: false, message: 'Tải avatar riêng đã tắt. Hãy chọn avatar trong Cửa hàng.' });
});

/**
 * @swagger
 * /api/auth/password:
 *   put:
 *     tags: [Auth]
 *     summary: Đổi mật khẩu
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string, format: password }
 *               newPassword:     { type: string, format: password }
 *     responses:
 *       200:
 *         description: Đổi mật khẩu thành công
 *       400:
 *         description: Mật khẩu hiện tại không đúng
 */
router.put('/password', protect, authController.changePassword);

/**
 * @swagger
 * /api/auth/sync:
 *   post:
 *     tags: [Auth]
 *     summary: Đồng bộ tiến độ học từ thiết bị khác
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sync thành công
 */
router.post('/sync', protect, authController.syncProgress);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Đăng xuất
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Đăng xuất thành công
 */
router.post('/logout', protect, authController.logout);

module.exports = router;
