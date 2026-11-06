/**
 * HỒ SƠ MỤC TIÊU TOEIC — trình độ theo từng Part, đọc từ các bài Mini/Full Test đã làm.
 *
 * Không có bài test đầu vào riêng: đề thật là thước đo tốt hơn, và cùng nguồn với thẻ dự đoán
 * điểm (`toeicPrediction`) nên hai nơi không thể nói hai điều khác nhau.
 *
 * Chọn trọng tâm bằng luật:
 *   1. Còn Part chưa có dữ liệu: làm Part đó trước, chưa đo thì mọi kết luận đều là đoán.
 *   2. Đủ dữ liệu: chọn Part MẤT NHIỀU CÂU NHẤT, không phải Part có tỉ lệ thấp nhất. Sai 50%
 *      Part 1 (6 câu) mất 3 câu; sai 30% Part 7 (54 câu) mất 16 câu, luyện Part 7 lợi hơn.
 */
const ToeicAttempt = require('../models/ToeicAttempt');
const UserProfile = require('../models/UserProfile');
const { predictToeicScore, partAccuracy, PART_COUNTS, SO_CAU_TOI_THIEU_FULL } = require('./toeicPrediction');

/** Dưới mức này (số câu đã giảm trọng số) thì chưa đủ để kết luận về một Part. */
const CAU_TOI_THIEU = 5;
/** Khảo sát từ Part ngắn, ít tốn thời gian trước để sớm có bức tranh chung. */
const THU_TU_KHAO_SAT = [5, 2, 6, 1, 3, 4, 7];

const PART = {
    1: { ten: 'Mô tả tranh', ky: 'nghe', viec: 'Nghe kỹ động từ và vị trí của vật trong tranh.' },
    2: { ten: 'Hỏi đáp', ky: 'nghe', viec: 'Tập trung vào từ để hỏi ở đầu câu, cảnh giác đáp án có từ phát âm giống câu hỏi.' },
    3: { ten: 'Hội thoại', ky: 'nghe', viec: 'Đọc trước câu hỏi rồi nghe có chủ đích, chú ý người nói đổi ý.' },
    4: { ten: 'Bài nói ngắn', ky: 'nghe', viec: 'Xác định trước loại bài nói: thông báo, quảng cáo hay tin nhắn thoại.' },
    5: { ten: 'Điền vào câu', ky: 'doc', viec: 'Ôn ngữ pháp và từ loại; nhìn từ đứng trước và sau chỗ trống.' },
    6: { ten: 'Điền vào đoạn', ky: 'doc', viec: 'Đọc cả đoạn để chọn thì và từ nối đúng mạch văn.' },
    7: { ten: 'Đọc hiểu', ky: 'doc', viec: 'Đọc câu hỏi trước, tìm thông tin theo từ khoá và tập phân bổ thời gian.' },
};
/** Part kiểm tra ngữ pháp trực tiếp: gợi ý mở Công thức ngữ pháp. */
const PART_NGU_PHAP = new Set([5, 6]);

/** Tóm tắt từng Part từ lịch sử (phần tử đầu = bài mới nhất) (thuần). */
function tomTatPart(attempts = []) {
    const acc = partAccuracy(attempts);
    return Object.keys(PART).map(Number).map((part) => {
        const a = acc.get(part);
        const duDuLieu = (a?.total || 0) >= CAU_TOI_THIEU;
        return {
            part,
            ...PART[part],
            duDuLieu,
            doChinhXac: duDuLieu ? Math.round(a.accuracy * 100) : null,
            cauMat: duDuLieu ? Math.round((1 - a.accuracy) * PART_COUNTS[part]) : null,
            soCauChuan: PART_COUNTS[part],
        };
    });
}

/** Part cần luyện tiếp theo, kèm lý do (thuần). */
function chonPartTrongTam(parts) {
    const chuaCo = THU_TU_KHAO_SAT.map((n) => parts.find((p) => p.part === n)).find((p) => p && !p.duDuLieu);
    const yeuNhat = chuaCo ? null : [...parts].sort((a, b) => b.cauMat - a.cauMat)[0];
    const p = chuaCo || yeuNhat;
    if (!p) return null;
    return {
        part: p.part,
        ten: p.ten,
        viec: p.viec,
        canNguPhap: PART_NGU_PHAP.has(p.part),
        lyDo: chuaCo
            ? `Chưa đủ dữ liệu về Part ${p.part}, làm một Mini Test để hệ thống đánh giá được.`
            : `Part ${p.part} đang mất nhiều câu nhất: khoảng ${p.cauMat}/${p.soCauChuan} câu trong một đề.`,
    };
}

/** Kỹ năng yếu hơn, tính theo tỉ lệ câu mất. Thiếu dữ liệu một bên thì không so (thuần). */
function kyNangYeuHon(parts) {
    const tiLe = (ky) => {
        const ds = parts.filter((p) => p.ky === ky && p.duDuLieu);
        if (!ds.length) return null;
        return ds.reduce((s, p) => s + p.cauMat, 0) / ds.reduce((s, p) => s + p.soCauChuan, 0);
    };
    const nghe = tiLe('nghe');
    const doc = tiLe('doc');
    if (nghe === null || doc === null || nghe === doc) return null;
    return nghe > doc ? 'nghe' : 'doc';
}

async function layHoSoToeic(userId) {
    // Cùng truy vấn với thẻ dự đoán điểm, để hai nơi luôn ra cùng một con số.
    const [attempts, profile] = await Promise.all([
        ToeicAttempt.find({ userId, status: 'completed' })
            .sort({ completedAt: -1 })
            .limit(30)
            .select('testType totalScore listeningScore readingScore partScores completedAt')
            .lean(),
        UserProfile.findOne({ userId }).select('settings.toeicTargetScore').lean(),
    ]);
    const diemMucTieu = Number(profile?.settings?.toeicTargetScore) || 0;
    const parts = tomTatPart(attempts);
    return {
        diemMucTieu,
        soBai: attempts.length,
        duDoan: predictToeicScore(attempts, diemMucTieu),
        parts,
        trongTam: chonPartTrongTam(parts),
        kyYeu: kyNangYeuHon(parts),
    };
}

module.exports = { SO_CAU_TOI_THIEU_FULL, layHoSoToeic, tomTatPart, chonPartTrongTam, kyNangYeuHon, PART, CAU_TOI_THIEU };
