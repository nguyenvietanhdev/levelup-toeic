const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Protect routes - JWT Authentication
 */
const protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Not authorized - no token provided',
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found',
            });
        }

        if (!user.isActive) {
            return res.status(401).json({
                success: false,
                message: 'Account is disabled',
            });
        }

        // Khoá tài khoản phải ăn NGAY, không đợi token hết hạn (JWT_EXPIRE mặc
        // định 7 ngày). Login đã chặn ở authController.login, nhưng token cấp
        // TRƯỚC lúc khoá vẫn đi lọt qua đây — admin bấm khoá, bảng admin hiện
        // "đã khoá", mà người đó vẫn thi/tiêu xu/upload như thường suốt một tuần.
        // Dùng 423 giống hệt login: frontend đã bắt sẵn (api/http.js) và tự đăng
        // xuất, nên không phải sửa gì bên client.
        // Miễn trừ cho admin vì cùng lý do login miễn trừ: chưa có đường lấy lại
        // tài khoản nếu tự khoá mình. Bỏ miễn trừ này khi có backoff + OTP.
        if (user.role !== 'admin') {
            if (user.isLocked) {
                return res.status(423).json({
                    success: false,
                    locked: true,
                    lockType: 'admin',
                    message: 'Tài khoản đã bị khóa bởi quản trị viên. Vui lòng liên hệ hỗ trợ.',
                });
            }
            if (user.lockUntil && new Date(user.lockUntil).getTime() > Date.now()) {
                return res.status(423).json({
                    success: false,
                    locked: true,
                    lockType: 'temp',
                    lockUntil: user.lockUntil,
                    message: 'Tài khoản tạm thời bị khóa do nhập sai quá nhiều lần.',
                });
            }
        }

        req.user = {
            id: user._id,
            role: user.role,
            bypassFeatureLock: user.bypassFeatureLock === true,
        };

        next();

    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ success: false, message: 'Invalid token' });
        }
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: 'Token expired' });
        }
        return res.status(401).json({ success: false, message: 'Not authorized' });
    }
};

/**
 * Grant access to specific roles
 */
const authorize = (...roles) => {
    return (req, res, next) => {
        // Gắn authorize mà quên protect thì req.user không tồn tại: đọc
        // req.user.role sẽ ném TypeError → errorHandler trả 500, biến lỗi gắn
        // thiếu middleware thành "lỗi server" khó lần ra. Route vẫn không vào
        // được, nhưng phải báo đúng 401.
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Not authorized',
            });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Role '${req.user.role}' is not authorized`,
            });
        }
        next();
    };
};

module.exports = { protect, authorize };
