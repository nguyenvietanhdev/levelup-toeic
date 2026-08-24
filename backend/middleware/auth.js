const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

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
        // `isLocked` = khoá THỦ CÔNG do admin bấm. Đây là quyết định của con
        // người nên phải ăn ngay, không đợi token hết hạn. Miễn trừ cho admin vì
        // chưa có đường lấy lại nếu người cuối cùng tự khoá mình.
        if (user.role !== 'admin' && user.isLocked) {
            return res.status(423).json({
                success: false,
                locked: true,
                lockType: 'admin',
                message: 'Tài khoản đã bị khóa bởi quản trị viên. Vui lòng liên hệ hỗ trợ.',
            });
        }

        // `lockUntil` (backoff do nhập sai) cố ý KHÔNG kiểm ở đây, cho BẤT KỲ AI.
        //
        // Backoff là cửa ĐĂNG NHẬP, không phải lệnh cấm. Kiểm ở đây thì bất kỳ ai
        // biết email của bạn cũng đá được bạn ra khỏi phiên đang làm việc: gõ sai
        // mật khẩu của bạn 5 lần là xong. Biện pháp chống brute-force trở thành
        // công cụ quấy rối, và nạn nhân không hiểu vì sao mình bị đăng xuất liên
        // tục. Kẻ tấn công vẫn không vào được — đó là việc của cửa đăng nhập.
        //
        // Ai muốn CẤM một tài khoản thì dùng isLocked ở trên, đó mới là ý định rõ ràng.

        // `email` phải có mặt ở đây, không phải để tiện.
        //
        // Quyền sở hữu của từ vựng riêng biểu diễn bằng CHUỖI `ownerEmail`
        // (UserUpload.js:40), nên 9 handler trong uploadController đều phải tự
        // truy vấn lại email — thừa một lượt đi về DB mỗi request. Tệ hơn: chúng
        // đọc `userDoc?.email`, mà nếu doc là null thì email là `undefined`, và
        // Mongoose BỎ HẲN key đó khỏi filter. `{ownerEmail: undefined, source}`
        // trở thành `{source}` — quét dữ liệu của MỌI người dùng.
        //
        // Doc đã nạp sẵn ở trên rồi, lấy luôn email thì các handler đọc thẳng
        // `req.user.email`, không còn nhánh `?.` nào để rơi vào trạng thái đó.
        req.user = {
            id: user._id,
            email: user.email,
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

        // MỌI lỗi khác KHÔNG được thành 401.
        //
        // Đây là lỗi thật đã gặp: Render khởi động lại instance (free tier ngủ
        // sau 15 phút không có request), MongoDB chưa kết nối xong, nên
        // `User.findById` ném `MongooseError`. Nhánh cuối cũ trả 401 cho lỗi đó
        // — mà client thấy 401 là phát `auth:expired`, XOÁ TOKEN và đăng xuất.
        // Người dùng bị bắt đăng nhập lại sau mỗi lần server ngủ dậy, dù token
        // của họ còn hạn và hoàn toàn hợp lệ.
        //
        // 503 mới đúng nghĩa: "server chưa sẵn sàng, thử lại đi" — client giữ
        // nguyên token và người dùng chỉ cần tải lại trang.
        const dbChuaSan = error.name?.startsWith('Mongo')
            || error.name === 'MongooseError'
            || error.message?.includes('buffering timed out');
        if (dbChuaSan) {
            logger.warn('Auth: DB chưa sẵn sàng, trả 503 thay vì 401', error.message);
            return res.status(503).json({
                success: false,
                message: 'Máy chủ đang khởi động, vui lòng thử lại sau vài giây.',
                retryable: true,
            });
        }

        // Lỗi lạ: vẫn 401 nhưng ghi log, vì không biết là lỗi gì thì không dám
        // cho qua — chỉ là giờ nó không còn nuốt lỗi DB nữa.
        logger.error('Auth: lỗi không rõ nguyên nhân', error);
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
