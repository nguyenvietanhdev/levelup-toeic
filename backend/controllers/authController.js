const User = require('../models/User');
const UserProfile = require('../models/UserProfile');
const UserStats = require('../models/UserStats');
const OtpCode = require('../models/OtpCode');
const logger = require('../utils/logger');
const { buildFullState, applyEnergyRegen, createUserWithDependents } = require('../utils/userStateHelper');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const { emailQueue } = require('../queues');
const { sendOtpEmail } = require('../utils/emailService');

const QUEUE_TIMEOUT_MS = 2000;

// Client xác thực ID token Google. Khởi tạo 1 lần; audience kiểm tra trong verify.
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Nghiêm cấm đặt tên mạo danh admin/quản trị. Chuẩn hoá: bỏ dấu tiếng Việt,
// bỏ ký tự không phải chữ-số (chặn mẹo chèn dấu cách/ký tự lạ kiểu "a.d.m.i.n").
function isReservedUsername(name) {
    const normalized = (name || '')
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '') // bỏ dấu: "quản" -> "quan"
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9]/g, '');
    return /admin|administrator|quantri|quanly|moderator/.test(normalized);
}

async function dispatchEmail(to, code, type, jobId) {
    try {
        const addJob = emailQueue.add('send-otp', { to, code, type }, { jobId });
        addJob.catch(() => {}); // suppress dangling rejection if timeout wins
        await Promise.race([
            addJob,
            new Promise((_, reject) => setTimeout(() => reject(new Error('queue timeout')), QUEUE_TIMEOUT_MS)),
        ]);
    } catch (err) {
        logger.warn('Email queue unavailable, using fallback', { error: err.message });
        if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            await sendOtpEmail(to, code, type);
        } else {
            // No email credentials — print to console (dev only)
            logger.info('='.repeat(50));
            logger.info(`📧  OTP [dev, no SMTP] → ${to}  type=${type}`);
            logger.info(`    CODE: ${code}`);
            logger.info('='.repeat(50));
        }
    }
}

function generateOtp() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

// ===================================
// AUTH
// ===================================

const login = async (req, res, next) => {
    try {
        const { email, username, password } = req.body;
        const loginIdentifier = email || username;

        if (!loginIdentifier || !password) {
            return res.status(400).json({ success: false, message: 'Please provide email/username and password' });
        }

        // Find User — try email first, then username via UserProfile
        let user;
        if (loginIdentifier.includes('@')) {
            user = await User.findOne({ email: loginIdentifier.toLowerCase().trim() }).select('+password');
        } else {
            const profile = await UserProfile.findOne({ username: loginIdentifier.trim() });
            if (profile) user = await User.findById(profile.userId).select('+password');
        }

        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        if (!user.isActive) {
            return res.status(401).json({ success: false, message: 'Account is disabled' });
        }

        if (user.isLocked && user.role !== 'admin') {
            return res.status(423).json({ success: false, locked: true, lockType: 'admin', message: 'Tài khoản đã bị khóa bởi quản trị viên. Vui lòng liên hệ hỗ trợ.' });
        }

        const now = Date.now();
        if (user.role !== 'admin') {
            if (user.lockUntil && user.lockUntil > now) {
                return res.status(423).json({ success: false, locked: true, lockType: 'temp', lockUntil: user.lockUntil, message: 'Tài khoản tạm thời bị khóa do nhập sai quá nhiều lần.' });
            }
            if (user.lockUntil && user.lockUntil <= now) {
                user.loginAttempts = 0;
                user.lockUntil = null;
            }
        }

        const isMatch = await user.comparePassword(password);

        if (!isMatch) {
            if (user.role !== 'admin') {
                user.loginAttempts = (user.loginAttempts || 0) + 1;
                const attempts = user.loginAttempts;
                let lockMinutes = 0;
                if (attempts >= 20) lockMinutes = 60;
                else if (attempts >= 15) lockMinutes = 30;
                else if (attempts >= 10) lockMinutes = 15;
                else if (attempts >= 5) lockMinutes = 5;

                if (lockMinutes > 0) {
                    user.lockUntil = new Date(now + lockMinutes * 60 * 1000);
                    await user.save();
                    return res.status(423).json({ success: false, locked: true, lockType: 'temp', lockUntil: user.lockUntil, message: `Nhập sai quá nhiều lần. Tài khoản bị khóa ${lockMinutes} phút.` });
                }
                await user.save();
            }
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        // Reset lockout, update lastLoginAt
        user.loginAttempts = 0;
        user.lockUntil = null;
        user.lastLoginAt = Date.now();
        await user.save();

        // Regen energy on login
        const stats = await UserStats.findOne({ userId: user._id });
        if (stats) {
            applyEnergyRegen(stats);
            await stats.save();
        }

        const token = user.generateToken();
        const fullState = await buildFullState(user._id);

        res.json({ success: true, message: 'Login successful', token, user: fullState });
    } catch (error) {
        logger.error('Login error:', error);
        next(error);
    }
};

const getMe = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        // Refresh lastLoginAt mỗi lần /auth/me — phục vụ 2 mục đích:
        // 1) Daily leaderboard biết user có hoạt động hôm nay.
        // 2) "Online indicator" (ngưỡng 15 phút) thấy user còn sống.
        // Throttle 60s/lần để khỏi ghi DB mỗi request.
        const now = new Date();
        const lastTs = user.lastLoginAt ? new Date(user.lastLoginAt).getTime() : 0;
        if (now.getTime() - lastTs > 60 * 1000) {
            user.lastLoginAt = now;
            await user.save();
        }

        const stats = await UserStats.findOne({ userId: user._id });
        if (stats) {
            applyEnergyRegen(stats);
            await stats.save();
        }

        const fullState = await buildFullState(user._id);
        res.json({ success: true, data: fullState });
    } catch (error) {
        logger.error('GetMe error:', error);
        next(error);
    }
};

const updateProfile = async (req, res, next) => {
    try {
        const { username, avatar, settings } = req.body;

        const profile = await UserProfile.findOne({ userId: req.user.id });
        if (!profile) return res.status(404).json({ success: false, message: 'User not found' });

        if (username && username.trim() !== profile.username) {
            const nextName = username.trim();
            if (nextName.length < 3 || nextName.length > 20) {
                return res.status(400).json({ success: false, message: 'Tên phải từ 3 đến 20 ký tự' });
            }
            if (isReservedUsername(nextName)) {
                return res.status(400).json({ success: false, message: 'Tên không được chứa từ liên quan đến admin/quản trị' });
            }

            // Giới hạn đổi tên: 1 lần / 30 ngày.
            const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
            if (profile.usernameChangedAt) {
                const elapsed = Date.now() - new Date(profile.usernameChangedAt).getTime();
                if (elapsed < COOLDOWN_MS) {
                    const daysLeft = Math.ceil((COOLDOWN_MS - elapsed) / (24 * 60 * 60 * 1000));
                    return res.status(429).json({
                        success: false,
                        message: `Bạn chỉ có thể đổi tên 1 lần mỗi 30 ngày. Vui lòng thử lại sau ${daysLeft} ngày.`,
                    });
                }
            }

            const existing = await UserProfile.findOne({ username: nextName, userId: { $ne: req.user.id } });
            if (existing) return res.status(400).json({ success: false, message: 'Tên này đã được sử dụng' });
            profile.username = nextName;
            profile.usernameChangedAt = new Date();
        }

        if (avatar) profile.avatar = avatar;

        if (settings) {
            Object.assign(profile.settings, settings);
            profile.markModified('settings');
        }

        await profile.save();

        const fullState = await buildFullState(req.user.id);
        res.json({ success: true, message: 'Profile updated successfully', data: fullState });
    } catch (error) {
        logger.error('UpdateProfile error:', error);
        next(error);
    }
};

const uploadAvatar = async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'Không có file ảnh' });

        const avatarUrl = `/uploads/avatars/${req.file.filename}`;

        const profile = await UserProfile.findOne({ userId: req.user.id });
        if (!profile) return res.status(404).json({ success: false, message: 'User not found' });

        profile.avatar = avatarUrl;
        await profile.save();

        res.json({ success: true, avatar: avatarUrl });
    } catch (error) {
        logger.error('UploadAvatar error:', error);
        next(error);
    }
};

const changePassword = async (req, res, next) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: 'Please provide current and new password' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
        }

        const user = await User.findById(req.user.id).select('+password');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) return res.status(401).json({ success: false, message: 'Current password is incorrect' });

        const isSame = await bcrypt.compare(newPassword, user.password);
        if (isSame) return res.status(400).json({ success: false, message: 'New password cannot be the same as current password' });

        user.password = newPassword;
        await user.save();

        res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
        logger.error('ChangePassword error:', error);
        next(error);
    }
};

const logout = async (req, res) => {
    res.json({ success: true, message: 'Logged out successfully' });
};

// ===================================
// FORGOT PASSWORD
// ===================================

const forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, message: 'Vui lòng nhập email' });

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) return res.json({ success: true, message: 'Nếu email tồn tại, mã sẽ được gửi đến hộp thư của bạn' });

        const normalEmail = email.toLowerCase().trim();
        await OtpCode.deleteMany({ email: normalEmail, type: 'reset' });

        const code = generateOtp();
        const hashedCode = await bcrypt.hash(code, 10);
        const otpDoc = await OtpCode.create({
            email: normalEmail,
            code: hashedCode,
            type: 'reset',
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        });

        // Respond immediately — email sends in background
        res.json({ success: true, message: 'Mã xác nhận đã được gửi đến email của bạn' });

        dispatchEmail(email, code, 'reset', `reset-${otpDoc._id}`)
            .catch(err => logger.error('Background reset email failed', { to: email, error: err.message }));
    } catch (error) {
        logger.error('ForgotPassword error:', error);
        next(error);
    }
};

const resetPassword = async (req, res, next) => {
    try {
        const { email, code, newPassword } = req.body;

        if (!email || !code || !newPassword) return res.status(400).json({ success: false, message: 'Thiếu thông tin' });
        if (newPassword.length < 6) return res.status(400).json({ success: false, message: 'Mật khẩu phải ít nhất 6 ký tự' });

        const otp = await OtpCode.findOne({ email: email.toLowerCase().trim(), type: 'reset' });
        if (!otp) return res.status(400).json({ success: false, message: 'Mã không hợp lệ hoặc đã hết hạn' });

        if (otp.attempts >= 5) {
            await otp.deleteOne();
            return res.status(400).json({ success: false, message: 'Quá nhiều lần thử sai. Vui lòng yêu cầu mã mới.' });
        }

        const isMatch = await bcrypt.compare(code.trim(), otp.code);
        if (!isMatch) {
            otp.attempts += 1;
            await otp.save();
            return res.status(400).json({ success: false, message: `Mã không đúng. Còn ${5 - otp.attempts} lần thử.` });
        }

        const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
        if (!user) return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản' });

        const isSame = await user.comparePassword(newPassword);
        if (isSame) return res.status(400).json({ success: false, message: 'Mật khẩu mới không được giống mật khẩu cũ' });

        user.password = newPassword;
        await user.save();
        await otp.deleteOne();

        res.json({ success: true, message: 'Đặt lại mật khẩu thành công! Vui lòng đăng nhập lại.' });
    } catch (error) {
        logger.error('ResetPassword error:', error);
        next(error);
    }
};

// ===================================
// OTP REGISTER FLOW
// ===================================

const sendRegisterOtp = async (req, res, next) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ thông tin' });
        if (password.length < 6) return res.status(400).json({ success: false, message: 'Mật khẩu phải ít nhất 6 ký tự' });
        if (username.trim().length < 3 || username.length > 20) return res.status(400).json({ success: false, message: 'Username phải 3-20 ký tự' });
        if (isReservedUsername(username)) return res.status(400).json({ success: false, message: 'Tên không được chứa từ liên quan đến admin/quản trị' });

        const normalEmail = email.toLowerCase().trim();
        const normalUsername = username.trim();

        const [existingUser, existingProfile] = await Promise.all([
            User.findOne({ email: normalEmail }),
            UserProfile.findOne({ username: normalUsername }),
        ]);

        if (existingUser) return res.status(400).json({ success: false, message: 'Email này đã được đăng ký' });
        if (existingProfile) return res.status(400).json({ success: false, message: 'Username đã được sử dụng' });

        const passwordHash = await bcrypt.hash(password, 10);
        await OtpCode.deleteMany({ email: normalEmail, type: 'register' });

        const code = generateOtp();
        const hashedCode = await bcrypt.hash(code, 10);
        const otpDoc = await OtpCode.create({
            email: normalEmail,
            code: hashedCode,
            type: 'register',
            userData: { username: normalUsername, passwordHash },
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        });

        // Respond immediately — email sends in background
        res.json({ success: true, message: 'Mã xác nhận đã được gửi đến email của bạn' });

        dispatchEmail(email, code, 'register', `register-${otpDoc._id}`)
            .catch(err => logger.error('Background register email failed', { to: email, error: err.message }));
    } catch (error) {
        logger.error('SendRegisterOtp error:', error);
        next(error);
    }
};

const verifyRegisterOtp = async (req, res, next) => {
    try {
        const { email, code } = req.body;
        if (!email || !code) return res.status(400).json({ success: false, message: 'Thiếu thông tin' });

        const otp = await OtpCode.findOne({ email: email.toLowerCase().trim(), type: 'register' });
        if (!otp) return res.status(400).json({ success: false, message: 'Mã không hợp lệ hoặc đã hết hạn' });

        if (otp.attempts >= 5) {
            await otp.deleteOne();
            return res.status(400).json({ success: false, message: 'Quá nhiều lần thử sai. Vui lòng đăng ký lại.' });
        }

        const isMatch = await bcrypt.compare(code.trim(), otp.code);
        if (!isMatch) {
            otp.attempts += 1;
            await otp.save();
            return res.status(400).json({ success: false, message: `Mã không đúng. Còn ${5 - otp.attempts} lần thử.` });
        }

        const { username, passwordHash } = otp.userData;

        // Race condition check
        const [existingUser, existingProfile] = await Promise.all([
            User.findOne({ email: otp.email }),
            UserProfile.findOne({ username }),
        ]);
        if (existingUser || existingProfile) {
            await otp.deleteOne();
            return res.status(400).json({ success: false, message: 'Tài khoản đã tồn tại' });
        }

        const { user } = await createUserWithDependents({
            email: otp.email,
            passwordHash,
            username,
            skipPasswordHash: true,
        });

        await otp.deleteOne();

        const token = user.generateToken();
        const fullState = await buildFullState(user._id);

        res.status(201).json({ success: true, message: 'Đăng ký thành công!', token, user: fullState });
    } catch (error) {
        logger.error('VerifyRegisterOtp error:', error);
        next(error);
    }
};

// Direct register (non-OTP path — kept for backward compat / admin use)
const register = async (req, res, next) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ thông tin' });
        }
        if (password.length < 6) {
            return res.status(400).json({ success: false, message: 'Mật khẩu phải ít nhất 6 ký tự' });
        }
        if (username.trim().length < 3 || username.trim().length > 20) {
            return res.status(400).json({ success: false, message: 'Tên người dùng phải 3-20 ký tự' });
        }
        if (isReservedUsername(username)) {
            return res.status(400).json({ success: false, message: 'Tên không được chứa từ liên quan đến admin/quản trị' });
        }

        const normalEmail = email.toLowerCase().trim();
        const normalUsername = username.trim();

        const [existingUser, existingProfile] = await Promise.all([
            User.findOne({ email: normalEmail }),
            UserProfile.findOne({ username: normalUsername }),
        ]);

        if (existingUser) return res.status(400).json({ success: false, message: 'Email này đã được đăng ký' });
        if (existingProfile) return res.status(400).json({ success: false, message: 'Tên người dùng đã được sử dụng' });

        const { user } = await createUserWithDependents({ email: normalEmail, passwordHash: password, username: normalUsername });

        const token = user.generateToken();
        const fullState = await buildFullState(user._id);

        res.status(201).json({ success: true, message: 'Registration successful', token, user: fullState });
    } catch (error) {
        logger.error('Register error:', error);
        next(error);
    }
};

const checkLock = async (req, res, next) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, message: 'Email required' });

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) return res.json({ success: true, locked: false });
        if (user.isLocked) return res.json({ success: true, locked: true, lockType: 'admin' });

        const now = Date.now();
        if (user.lockUntil && user.lockUntil > now) {
            return res.json({ success: true, locked: true, lockType: 'temp', lockUntil: user.lockUntil });
        }

        return res.json({ success: true, locked: false });
    } catch (error) {
        next(error);
    }
};

// syncProgress is kept for backward compat — delegates to saveState logic via UserStats
const syncProgress = async (req, res, next) => {
    try {
        const { resources, progress, streak, settings } = req.body;

        const [profile, stats] = await Promise.all([
            UserProfile.findOne({ userId: req.user.id }),
            UserStats.findOne({ userId: req.user.id }),
        ]);

        if (!profile || !stats) return res.status(404).json({ success: false, message: 'User not found' });

        applyEnergyRegen(stats);

        // ⚠️ SERVER-AUTHORITATIVE: giống saveState — KHÔNG tin client về tiền tệ
        // và counter tổng. Chỉ nhận energy (giới hạn lượt) + danh sách từ.
        // Tiền tệ/level/counter do các endpoint server cấp (/practice/submit...).
        if (resources) {
            if (resources.energy !== undefined) stats.energy = resources.energy;
            if (resources.maxEnergy !== undefined) stats.maxEnergy = resources.maxEnergy;
        }

        if (progress) {
            if (progress.wordsLearned) stats.wordsLearned = progress.wordsLearned;
            if (progress.wordsMastered) stats.wordsMastered = progress.wordsMastered;
        }

        // Streak KHÔNG ghi từ client (xem userStateController.saveState). Nguồn
        // sự thật duy nhất là /practice/submit để tránh client cũ reset streak.
        void streak;

        if (settings) {
            Object.assign(profile.settings, settings);
            profile.markModified('settings');
            await profile.save();
        }

        await stats.save();

        const fullState = await buildFullState(req.user.id);
        res.json({ success: true, message: 'Progress synced successfully', data: fullState });
    } catch (error) {
        logger.error('SyncProgress error:', error);
        next(error);
    }
};

// ===================================
// GOOGLE LOGIN (Google Identity Services)
// ===================================
// Frontend gửi { credential } = ID token Google. Verify chữ ký + audience,
// tìm/khởi tạo user theo email, phát JWT như login thường.
const googleLogin = async (req, res, next) => {
    try {
        const { credential } = req.body;
        if (!credential) {
            return res.status(400).json({ success: false, message: 'Thiếu Google credential' });
        }
        if (!process.env.GOOGLE_CLIENT_ID) {
            return res.status(500).json({ success: false, message: 'Đăng nhập Google chưa được cấu hình trên máy chủ' });
        }

        // Verify token (chữ ký Google + audience = Client ID của ta)
        let payload;
        try {
            const ticket = await googleClient.verifyIdToken({
                idToken: credential,
                audience: process.env.GOOGLE_CLIENT_ID,
            });
            payload = ticket.getPayload();
        } catch (e) {
            logger.warn('Google verifyIdToken failed', { error: e.message });
            return res.status(401).json({ success: false, message: 'Google credential không hợp lệ' });
        }

        const email = (payload.email || '').toLowerCase().trim();
        if (!email || payload.email_verified === false) {
            return res.status(400).json({ success: false, message: 'Email Google chưa được xác thực' });
        }
        const googleId = payload.sub;

        let user = await User.findOne({ email });
        if (user) {
            // Liên kết googleId nếu tài khoản email này chưa gắn (đăng ký thường trước đó)
            if (!user.googleId) {
                user.googleId = googleId;
            }
        } else {
            // Tạo user mới — username suy ra từ tên/email, đảm bảo không trùng
            const base = (payload.name || email.split('@')[0])
                .normalize('NFD').replace(/[̀-ͯ]/g, '')
                .replace(/[^a-zA-Z0-9]/g, '')
                .slice(0, 20) || 'user';
            let username = base;
            let n = 0;
            // eslint-disable-next-line no-await-in-loop
            while (await UserProfile.findOne({ username })) {
                n += 1;
                username = `${base}${n}`;
            }
            // Mật khẩu ngẫu nhiên (không dùng để đăng nhập) chỉ để qua validate
            const randomPassword = crypto.randomBytes(24).toString('hex');
            const created = await createUserWithDependents({
                email,
                passwordHash: randomPassword,
                username,
                googleId,
                // Tên hiển thị lấy thẳng từ Google (payload.name) — có sẵn, khỏi bắt
                // user nhập lại. Ảnh Google gắn ở dưới. locale Google không lưu vì
                // app không có gì dùng tới (UI tiếng Việt, ngôn ngữ học chọn riêng).
                displayName: (payload.name || '').trim(),
            });
            user = created.user;
        }

        user.lastLoginAt = Date.now();
        await user.save();

        // Điền tên hiển thị + avatar từ Google khi user CHƯA có (không đè cái tự đặt).
        if (payload.name || payload.picture) {
            const profile = await UserProfile.findOne({ userId: user._id });
            if (profile) {
                let dirty = false;
                if (payload.name && !profile.displayName) {
                    profile.displayName = payload.name.trim();
                    dirty = true;
                }
                // Avatar Google (URL ngoài) chỉ dùng khi avatar hiện là chữ cái mặc định.
                if (payload.picture && !/^(https?:|\/|data:)/.test(profile.avatar || '')) {
                    profile.avatar = payload.picture;
                    dirty = true;
                }
                if (dirty) await profile.save();
            }
        }

        const token = user.generateToken();
        const fullState = await buildFullState(user._id);

        res.json({ success: true, message: 'Đăng nhập Google thành công', token, user: fullState });
    } catch (error) {
        logger.error('GoogleLogin error:', error);
        next(error);
    }
};

module.exports = {
    register,
    googleLogin,
    login,
    logout,
    getMe,
    updateProfile,
    uploadAvatar,
    changePassword,
    syncProgress,
    forgotPassword,
    resetPassword,
    sendRegisterOtp,
    verifyRegisterOtp,
    checkLock,
};
