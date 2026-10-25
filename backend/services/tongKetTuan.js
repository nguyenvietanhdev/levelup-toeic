/**
 * GIA SƯ TỔNG KẾT TUẦN — tầng 3 của hồ sơ năng lực.
 *
 * Màn "Tiến bộ của tôi" đưa ra con số; đây là phần một giáo viên sẽ nói sau khi
 * nhìn những con số đó: tuần này khá lên ở đâu, lỗi nào vẫn lặp, tuần tới làm gì.
 *
 * Kiểm soát chi phí và độ tin cậy:
 *   · CHỈ tạo khi người học bấm, tối đa MỘT lần mỗi tuần (lưu `TongKetTuan`).
 *   · AI chỉ nhận bản tóm tắt số liệu đã tính sẵn (vài trăm token), không nhận bài.
 *   · Đầu ra bị kiểm lại ở server: cắt độ dài, giới hạn số mục, `buoc` phải là
 *     bước có thật của Lộ trình — AI bịa ra khoá lạ thì bỏ, không để client mở bừa.
 *   · Chưa đủ dữ liệu thì không gọi AI: tổng kết trên khoảng trống chỉ là văn mẫu.
 */
const TongKetTuan = require('../models/TongKetTuan');
// Nạp trễ như các bộ chấm khác: nạp module không được khởi tạo client AI (thiếu key là sập).
function chatCompletion(...args) {
    return require('../config/openai').chatCompletion(...args);
}
const { parseJson } = require('./essayGrader');
const { layTienBo } = require('./tienBo');
const { dauTuanVN } = require('./loTrinh');

/** Các bước của Lộ trình hôm nay mà kế hoạch được phép trỏ tới. */
const BUOC_HOP_LE = ['on-sai', 'hoc-tu', 'nghe', 'doc', 'noi', 'viet-dich'];

/** Cần ít nhất chừng này lượt trong 8 tuần mới có gì để tổng kết. */
const TOI_THIEU_LUOT = 3;

/**
 * Bản tóm tắt gửi AI: chỉ số liệu, gọn. Không gửi tên, email hay nội dung bài —
 * AI không cần biết người học là ai để nhận xét xu hướng.
 */
function tomTatChoAI(hs) {
    return {
        skills: hs.kyNang
            .filter((k) => k.soLuot > 0)
            .map((k) => ({
                // Ghi rõ THANG: thiếu nó thì AI tự đoán ("4.3/5" cho điểm thang 9).
                name: k.ten, scale: k.donVi === '%' ? 'percent 0-100' : 'band 0-9', earlier4w: k.truoc, last4w: k.ganDay,
                trend: k.xuHuong || 'not enough data', sessions: k.soLuot,
            })),
        grammarErrors: hs.nguPhap.map((g) => ({
            type: g.vi, total: g.count, perTaskEarlier: g.truoc, perTaskRecent: g.ganDay,
            trend: g.xuHuong || 'not enough data',
        })),
        speakingCriteria: hs.tieuChiNoi.map((c) => ({ name: c.label, scale: 'band 0-9', earlier: c.truoc, recent: c.ganDay })),
        wrongWords: hs.tuVung,
    };
}

const cat = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Kiểm lại đầu ra AI — không tin hình dạng, độ dài hay khoá bước. */
function chuanHoaKetQua(obj) {
    if (!obj || typeof obj !== 'object') return null;
    const ds = (a, n) => (Array.isArray(a) ? a : []).map((x) => cat(x, 200)).filter(Boolean).slice(0, n);
    const keHoach = (Array.isArray(obj.plan) ? obj.plan : [])
        .map((p) => ({
            viec: cat(p?.task, 200),
            buoc: BUOC_HOP_LE.includes(p?.step) ? p.step : '',
        }))
        .filter((p) => p.viec)
        .slice(0, 3);
    const tomTat = cat(obj.summary, 600);
    if (!tomTat && !keHoach.length) return null;
    return { tomTat, tienBo: ds(obj.better, 3), canLuyen: ds(obj.focus, 3), keHoach };
}

function promptTongKet(duLieu) {
    return [
        {
            role: 'system',
            content: [
                'You are an experienced exam-prep teacher writing a short weekly review for a Vietnamese learner.',
                'You get ONLY numbers from their learning profile (last 8 weeks, earlier 4 weeks vs last 4 weeks).',
                'RULES:',
                '1. Write in Vietnamese, warm but honest, addressing the learner as "bạn".',
                '2. Use ONLY facts in the data. Never invent numbers, skills or errors. If a trend is "not enough data", do not call it progress or decline.',
                '3. Be specific: name the skill or error type and quote the numbers from the data.',
                '   Always write a score with its own scale: "4.3/9" for band 0-9, "80%" for percent. Never use another scale.',
                '4. The plan has 2-3 concrete tasks for next week. Each task gets "step", one of:',
                `   ${BUOC_HOP_LE.join(', ')} (on-sai = review wrong words, hoc-tu = vocabulary practice, nghe = listening, doc = reading, noi = speaking, viet-dich = writing or translation).`,
                '5. Return ONLY valid JSON, no markdown:',
                '{"summary":"<2-3 sentences>","better":["<up to 3>"],"focus":["<up to 3>"],"plan":[{"task":"<one sentence>","step":"<step>"}]}',
            ].join('\n'),
        },
        { role: 'user', content: JSON.stringify(duLieu) },
    ];
}

const raNgoai = (doc) => (doc ? {
    tuan: doc.tuan, tomTat: doc.tomTat, tienBo: doc.tienBo, canLuyen: doc.canLuyen,
    keHoach: doc.keHoach, taoLuc: doc.createdAt,
} : null);

/** Tổng kết tuần này đã có chưa (không gọi AI). */
async function layTongKet(userId, lang = 'en', now = new Date()) {
    const tuan = dauTuanVN(now);
    const doc = await TongKetTuan.findOne({ userId, tuan, lang }).lean();
    return { tuan, tongKet: raNgoai(doc) };
}

/**
 * Tạo tổng kết tuần này (nếu chưa có). Trả `{ tongKet, daCo }` hoặc `{ loi, ma }`.
 */
async function taoTongKet(userId, now = new Date()) {
    const hs = await layTienBo(userId, now);
    const lang = hs.lang === 'zh' ? 'zh' : 'en';
    const tuan = dauTuanVN(now);

    const cu = await TongKetTuan.findOne({ userId, tuan, lang }).lean();
    if (cu) return { tongKet: raNgoai(cu), daCo: true };

    const tongLuot = hs.kyNang.reduce((s, k) => s + k.soLuot, 0);
    if (tongLuot < TOI_THIEU_LUOT) {
        return { loi: `Cần ít nhất ${TOI_THIEU_LUOT} lượt học trong 8 tuần để có gì tổng kết.`, ma: 'it-du-lieu' };
    }

    const res = await chatCompletion(promptTongKet(tomTatChoAI(hs)), {
        maxTokens: 500,
        temperature: 0.4,   // thấp: đây là nhận xét theo số liệu, không phải sáng tác
        feature: 'weekly-review',
        userId,
    });
    if (!res.success) return { loi: 'AI chưa tổng kết được, thử lại sau.', ma: 'ai' };
    const kq = chuanHoaKetQua(parseJson(res.content));
    if (!kq) return { loi: 'AI trả về tổng kết không đọc được, thử lại sau.', ma: 'ai' };

    try {
        const doc = await TongKetTuan.create({ userId, tuan, lang, ...kq });
        return { tongKet: raNgoai(doc), daCo: false };
    } catch (err) {
        // Hai lần bấm song song: lần sau đụng khoá duy nhất → trả bản đã lưu.
        if (err?.code === 11000) {
            const da = await TongKetTuan.findOne({ userId, tuan, lang }).lean();
            return { tongKet: raNgoai(da), daCo: true };
        }
        throw err;
    }
}

module.exports = {
    layTongKet, taoTongKet, dauTuanVN, chuanHoaKetQua, tomTatChoAI, BUOC_HOP_LE, TOI_THIEU_LUOT,
};
