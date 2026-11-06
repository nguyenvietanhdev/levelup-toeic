/**
 * Tạo hoặc làm mới TÀI KHOẢN DEMO để người xem vào thử ngay, không cần đăng ký.
 *
 * Mở mọi tính năng (`bypassFeatureLock`), vai trò `user`, có sẵn level, streak và hồ sơ
 * trình độ. Đây là số liệu mẫu cho riêng tài khoản này, không đụng tới người dùng khác.
 * Mật khẩu lấy từ biến môi trường để không nằm trong repo.
 *
 * Chưa tạo lịch sử thi TOEIC: bài giả không có câu trả lời nên màn xem lại sẽ trống. Muốn có
 * thì đăng nhập tài khoản này và làm thật vài Mini Test.
 *
 * Chạy thử:  node scripts/seedDemoAccount.js
 * Chạy thật: DEMO_PASSWORD=... node scripts/seedDemoAccount.js --apply
 */
require('dotenv').config();
const mongoose = require('mongoose');

const DEMO_EMAIL = (process.env.DEMO_EMAIL || 'demo@levelup-toeic.dev').toLowerCase();
const DO_DAI_MAT_KHAU = 8;
const MOT_NGAY = 24 * 60 * 60 * 1000;

/** Số liệu mẫu (thuần). XP vừa phải để không chiếm đầu bảng xếp hạng của người thật. */
function duLieuDemo(now = new Date()) {
    const kyNang = (d, s, soLan = 6) => ({ d, s, soLan, capNhat: now });
    return {
        profile: { username: 'demo_levelup', displayName: 'Tài khoản Demo', avatar: 'D', level: 1 },
        stats: {
            xp: 4000,
            coins: 2500,
            gems: 40,
            energy: 100,
            hints: 5,
            shields: 2,
            streakCurrent: 7,
            streakLongest: 12,
            streakLastPlayDate: new Date(now.getTime() - MOT_NGAY),
        },
        hoSo: {
            mucTieu: 'giao-tiep',
            testNgay: now,
            kyNang: {
                'khung-cau': kyNang(2.4, 1.8),
                'qua-khu': kyNang(1.6, 2.6),
                'tell-say-talk': kyNang(1.2, 3),
                'mau-giao-tiep': kyNang(3.2, 1),
                nghe: kyNang(3.6, 0.6),
                noi: kyNang(1.4, 2.8),
            },
            chanDoan: [
                { kyNang: 'tell-say-talk', ten: 'Tell · Say · Talk', ma: 'chua-nam', nhan: 'Chưa nắm quy tắc', viec: 'Đọc thẻ quy tắc rồi bắt đầu với câu ngắn trong Phản xạ câu.' },
                { kyNang: 'qua-khu', ten: 'Kể chuyện đã qua', ma: 'chua-noi-kip', nhan: 'Biết cách viết nhưng chưa nói kịp', viec: 'Luyện Phản xạ câu bằng giọng nói để biến kiến thức thành phản xạ.' },
                { kyNang: 'khung-cau', ten: 'Câu đủ khung', ma: 'cau-ngan-duoc', nhan: 'Dựng được câu ngắn, câu dài còn vấp', viec: 'Luyện Phản xạ câu để quen dần với câu dài hơn.' },
                { kyNang: 'mau-giao-tiep', ten: 'Mẫu câu giao tiếp', ma: 'vung', nhan: 'Đã khá chắc', viec: 'Giữ nhịp bằng các câu khó hơn.' },
            ],
            lichSuTest: [{ ngay: now, diem: 50, theoKyNang: {} }],
        },
    };
}

async function main() {
    const apply = process.argv.includes('--apply');
    const matKhau = process.env.DEMO_PASSWORD || '';
    if (apply && matKhau.length < DO_DAI_MAT_KHAU) {
        throw new Error(`Cần DEMO_PASSWORD dài ít nhất ${DO_DAI_MAT_KHAU} ký tự.`);
    }
    await mongoose.connect(process.env.MONGODB_URI);
    const User = require('../models/User');
    const UserProfile = require('../models/UserProfile');
    const UserStats = require('../models/UserStats');
    const HoSoHocVien = require('../models/HoSoHocVien');
    const { applyLevelUp } = require('../utils/userStateHelper');

    const data = duLieuDemo();
    let user = await User.findOne({ email: DEMO_EMAIL });
    // Chỉ làm mới đúng tài khoản demo: email này mà không phải demo thì dừng, tránh đè người thật.
    if (user && (user.role !== 'user' || !user.bypassFeatureLock)) {
        throw new Error(`${DEMO_EMAIL} đã thuộc về một tài khoản không phải demo. Dừng, không ghi gì.`);
    }
    if (!user && await UserProfile.exists({ username: data.profile.username })) {
        throw new Error(`Tên ${data.profile.username} đã có người dùng. Dừng, không ghi gì.`);
    }
    console.log(`${user ? 'Sẽ làm mới' : 'Sẽ tạo'} tài khoản demo: ${DEMO_EMAIL}`);
    if (!apply) {
        console.log('[CHẠY THỬ] Chưa ghi gì. Đặt DEMO_PASSWORD và thêm --apply để thực hiện.');
        return mongoose.disconnect();
    }

    if (user) {
        user.password = matKhau;
        user.isActive = true;
        user.isLocked = false;
        await user.save();
    } else {
        user = await User.create({ email: DEMO_EMAIL, password: matKhau, role: 'user', bypassFeatureLock: true });
    }
    const profile = await UserProfile.findOneAndUpdate(
        { userId: user._id }, { $set: data.profile }, { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    const stats = await UserStats.findOneAndUpdate(
        { userId: user._id }, { $set: data.stats }, { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    // Level đi qua đúng hàm của hệ thống, không gõ tay, để XP và Level luôn khớp nhau.
    applyLevelUp(profile, stats);
    await Promise.all([profile.save(), stats.save()]);
    await HoSoHocVien.updateOne({ userId: user._id }, { $set: data.hoSo }, { upsert: true });

    console.log(`Xong: ${DEMO_EMAIL} · Level ${profile.level}`);
    return mongoose.disconnect();
}

if (require.main === module) {
    main().catch((err) => { console.error('LỖI:', err.message); process.exit(1); });
}

module.exports = { duLieuDemo, DEMO_EMAIL };
