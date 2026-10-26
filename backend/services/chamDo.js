/**
 * CHẤM ĐỎ trên menu — chỗ nào đang chờ người học.
 *
 *   · `dangDo`: chế độ có bài làm dở (bài nháp Viết/Dịch/Đọc/Nghe, phiên Chat /
 *     Hội thoại giọng nói chưa kết thúc) — để người học biết còn việc bỏ dở ở đâu.
 *   · `loTrinh`: lộ trình HÔM NAY chưa xong đủ bước (làm mới mỗi ngày, giờ VN).
 *   · `tongKet`: tuần này CHƯA có tổng kết mà đã có dữ liệu để tổng kết.
 *
 * Trả kèm `ngay` / `tuan` (giờ VN) để client tự ẩn chấm khi người học đã mở màn đó
 * trong ngày / trong tuần — chấm là lời nhắc, không phải thứ đeo bám.
 *
 * Chỉ ĐẾM (countDocuments / exists), không gọi AI: menu mở là gọi.
 */
const BaiNhap = require('../models/BaiNhap');
const Conversation = require('../models/Conversation');
const PracticeSession = require('../models/PracticeSession');
const TongKetTuan = require('../models/TongKetTuan');
const UserProfile = require('../models/UserProfile');
const { layLoTrinh, homNayVN, dauTuanVN } = require('./loTrinh');

const MOT_NGAY = 24 * 60 * 60 * 1000;

async function layChamDo(userId, now = new Date()) {
    const profile = await UserProfile.findOne({ userId }).select('settings').lean();
    const lang = profile?.settings?.vocabLang === 'zh' ? 'zh' : 'en';
    const tuan = dauTuanVN(now);

    const [nhap, chat, giong, loTrinh, daTongKet, coDuLieu] = await Promise.all([
        BaiNhap.find({ userId, lang }).select('mode').lean(),
        Conversation.exists({ userId, status: 'active', voice: { $ne: true }, 'turns.0': { $exists: true } }),
        Conversation.exists({ userId, status: 'active', voice: true, 'turns.0': { $exists: true } }),
        layLoTrinh(userId, now),
        TongKetTuan.exists({ userId, tuan, lang }),
        // Có học gì trong 8 tuần không — chưa có gì thì không có gì để tổng kết.
        PracticeSession.exists({ user: userId, completedAt: { $gte: new Date(now - 56 * MOT_NGAY) } }),
    ]);

    const coNhap = new Set(nhap.map((n) => n.mode));
    return {
        ngay: homNayVN(now).ngay,
        tuan,
        dangDo: {
            viet: coNhap.has('viet'),
            dich: coNhap.has('dich'),
            doc: coNhap.has('doc'),
            nghe: coNhap.has('nghe'),
            chat: !!chat,
            hoiThoai: !!giong,
        },
        loTrinh: loTrinh.soXong < loTrinh.tong,
        tongKet: !daTongKet && !!coDuLieu,
    };
}

module.exports = { layChamDo };
