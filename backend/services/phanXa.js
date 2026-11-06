/**
 * PHẢN XẠ CÂU — nhìn câu tiếng Việt ngắn, nói hoặc gõ câu tiếng Anh, thấy ngay câu đúng.
 *
 * Các chế độ khác chữa SAU khi làm cả một bài. Lỗi thật của người học lại là ghép câu
 * theo tiếng Việt và không có sẵn khung câu — chỉ luyện lặp lại mới thành phản xạ.
 *
 * Chấm: khớp câu mẫu hoặc cách nói khác trong kho (không tốn AI). Khác hẳn mới hỏi AI —
 * tiếng Anh có nhiều cách nói đúng, chấm cứng là báo sai oan. Mỗi câu của một lượt chỉ
 * chấm một lần nên số lượt AI có trần. AI lỗi thì KHÔNG tính sai: lỗi của máy không
 * được làm người học tụt lịch ôn.
 *
 * Ôn giãn cách theo từng câu: đúng → 3, 7, 14, 30 ngày; sai → ngày mai.
 * "Đã thuộc" = đúng 3 lần liên tiếp qua các lần ôn.
 */
const PhanXaTienDo = require('../models/PhanXaTienDo');
const BuoiPhanXa = require('../models/BuoiPhanXa');
const UserProfile = require('../models/UserProfile');
const { KHUNG, TAT_CA, THEO_ID } = require('./phanXaKho');
const { parseJson } = require('./essayGrader');
const logger = require('../utils/logger');

// Nạp trễ như các bộ chấm khác: nạp module không được khởi tạo client AI.
function chatCompletion(...args) {
    return require('../config/openai').chatCompletion(...args);
}

const MOT_NGAY = 24 * 60 * 60 * 1000;
const KHOANG = [1, 3, 7, 14, 30];
const BUOC_DA_THUOC = 3;
const SO_CAU = 12;

/** Viết tắt ↔ viết đủ tính là một: "I'm" = "I am". */
const VIET_TAT = [
    [/\bi'm\b/g, 'i am'], [/\b(you|we|they)'re\b/g, '$1 are'], [/\b(he|she|it|that|there|what)'s\b/g, '$1 is'],
    [/\bi'd\b/g, 'i would'], [/\b(you|he|she|we|they)'d\b/g, '$1 would'],
    [/\b(i|you|he|she|it|we|they)'ll\b/g, '$1 will'], [/\b(i|you|we|they)'ve\b/g, '$1 have'],
    [/\bcan't\b/g, 'cannot'], [/\bcan not\b/g, 'cannot'], [/\bwon't\b/g, 'will not'],
    [/\b(do|does|did|is|are|was|were|have|has|had|would|could|should)n't\b/g, '$1 not'],
];

/** Chuẩn hoá để so: bỏ hoa/thường, dấu câu, khác biệt viết tắt (giọng nói không có dấu câu). */
function chuanHoa(s) {
    let t = String(s || '').normalize('NFC').replace(/[‘’]/g, "'").toLowerCase();
    for (const [re, thay] of VIET_TAT) t = t.replace(re, thay);
    return t.replace(/[.,!?;:"()]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Khớp câu mẫu hoặc cách nói khác trong kho. */
function khopKho(traLoi, cau) {
    const a = chuanHoa(traLoi);
    return !!a && [cau.en, ...(cau.chap || [])].some((x) => chuanHoa(x) === a);
}

/** Lịch ôn sau một câu trả lời (thuần). */
function capNhatLich(td, dung, now = new Date()) {
    const buoc = dung ? Math.min((td?.buoc || 0) + 1, KHOANG.length - 1) : 0;
    return {
        buoc,
        denHan: new Date(now.getTime() + (dung ? KHOANG[buoc] : KHOANG[0]) * MOT_NGAY),
        daThuoc: buoc >= BUOC_DA_THUOC,
    };
}

const tron = (a) => {
    const b = [...a];
    for (let i = b.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
};

/**
 * Chọn câu cho một lượt (thuần): câu ĐẾN HẠN trước (hay sai trước), rồi câu MỚI, trộn
 * đều các khung. Xen kẽ khung nhớ lâu hơn cày một khung. `som`: hết câu đến hạn và câu
 * mới thì lấy những câu sắp đến hạn nhất.
 */
function chonCau({ tienDo = [], khung = '', som = false, now = new Date(), soCau = SO_CAU }) {
    const theoId = new Map(tienDo.map((t) => [t.cauId, t]));
    const kho = TAT_CA.filter((c) => !khung || c.khung === khung);
    const denHan = kho
        .filter((c) => theoId.has(c.id) && new Date(theoId.get(c.id).denHan) <= now)
        .sort((a, b) => (theoId.get(b.id).sai || 0) - (theoId.get(a.id).sai || 0));
    const moi = tron(kho.filter((c) => !theoId.has(c.id)));
    let chon = [...denHan, ...moi].slice(0, soCau);
    if (!chon.length && som) {
        chon = kho
            .slice()
            .sort((a, b) => new Date(theoId.get(a.id)?.denHan || 0) - new Date(theoId.get(b.id)?.denHan || 0))
            .slice(0, soCau);
    }
    return tron(chon);
}

/** AI chấm câu khác đáp án. null = không chấm được (không tính sai). */
async function aiCham(cau, traLoi, userId) {
    const res = await chatCompletion([
        {
            role: 'system',
            content: [
                'A Vietnamese learner translated a short sentence into spoken English.',
                'Decide: is it grammatical, natural English with the same meaning as the Vietnamese?',
                'Ignore capitalization and punctuation: it may come from speech recognition.',
                'Reply ONLY with JSON: {"ok":true|false,"note":"<one short Vietnamese sentence naming the main problem, empty if ok>"}',
            ].join('\n'),
        },
        { role: 'user', content: `Vietnamese: ${cau.vi}\nReference: ${cau.en}\nLearner: ${String(traLoi).slice(0, 200)}` },
    ], { maxTokens: 100, temperature: 0, feature: 'phan-xa-cham', userId }).catch(() => null);
    if (!res?.success) return null;
    const o = parseJson(res.content);
    if (!o || typeof o.ok !== 'boolean') return null;
    return { dung: o.ok, ghiChu: String(o.note || '').slice(0, 200) };
}

async function hoTro(userId) {
    const p = await UserProfile.findOne({ userId }).select('settings').lean();
    return p?.settings?.vocabLang !== 'zh';
}

/** Số câu mới / đến hạn / đã thuộc theo từng khung. */
async function tongQuan(userId, now = new Date()) {
    if (!(await hoTro(userId))) return { hoTro: false };
    const ds = await PhanXaTienDo.find({ userId }).select('cauId khung denHan daThuoc').lean();
    const khung = KHUNG.map((k) => {
        const cua = ds.filter((t) => t.khung === k.key);
        const denHan = cua.filter((t) => new Date(t.denHan) <= now).length;
        return {
            key: k.key, ten: k.ten, icon: k.icon, moTa: k.moTa, tong: k.cau.length,
            moi: k.cau.length - cua.length, denHan, daThuoc: cua.filter((t) => t.daThuoc).length,
        };
    });
    return {
        hoTro: true,
        khung,
        denHan: khung.reduce((s, k) => s + k.denHan, 0),
        moi: khung.reduce((s, k) => s + k.moi, 0),
        daThuoc: khung.reduce((s, k) => s + k.daThuoc, 0),
        tong: TAT_CA.length,
    };
}

/** Mở một lượt. Client chỉ nhận câu tiếng Việt — đáp án trả về sau khi chấm từng câu. */
async function taoBuoi(userId, { khung = '', som = false } = {}, now = new Date()) {
    if (!(await hoTro(userId))) return { buoi: null };
    const k = KHUNG.some((x) => x.key === khung) ? khung : '';
    const tienDo = await PhanXaTienDo.find({ userId }).select('cauId denHan sai').lean();
    const chon = chonCau({ tienDo, khung: k, som, now });
    if (!chon.length) return { buoi: null };
    const buoi = await BuoiPhanXa.create({ userId, cau: chon.map((c) => ({ cauId: c.id })) });
    return {
        buoi: {
            id: String(buoi._id),
            cau: chon.map((c) => ({ vi: c.vi, khung: c.khung, tenKhung: c.tenKhung })),
        },
    };
}

/** Chấm một câu. `traLoi` rỗng = bỏ qua (tính sai, không gọi AI). */
async function traLoi(userId, buoiId, i, body = {}, now = new Date()) {
    const buoi = await BuoiPhanXa.findOne({ _id: buoiId, userId }).lean();
    if (!buoi) return { loi: 'Không tìm thấy lượt luyện (có thể đã hết hạn).', ma: 404 };
    const muc = buoi.cau[i];
    const cau = muc && THEO_ID.get(muc.cauId);
    if (!cau) return { loi: 'Câu không hợp lệ.', ma: 400 };
    if (muc.daTra) return { loi: 'Câu này đã trả lời rồi.', ma: 409 };

    // Chiếm câu TRƯỚC khi hỏi AI: bấm hai lần không tốn hai lượt AI, không tính hai lần.
    const chiem = await BuoiPhanXa.updateOne(
        { _id: buoiId, userId, [`cau.${i}.daTra`]: false },
        { $set: { [`cau.${i}.daTra`]: true } },
    );
    if (!(chiem?.modifiedCount ?? chiem?.nModified)) return { loi: 'Câu này đã trả lời rồi.', ma: 409 };

    const chu = typeof body.traLoi === 'string' ? body.traLoi.trim().slice(0, 200) : '';
    let dung = false;
    let ghiChu = '';
    let khongChac = false;
    if (chu) {
        if (khopKho(chu, cau)) {
            dung = true;
        } else {
            const r = await aiCham(cau, chu, userId);
            if (r) ({ dung, ghiChu } = r);
            else {
                khongChac = true;
                logger.warn('Phản xạ câu: AI không chấm được', { cauId: cau.id });
            }
        }
    }

    await BuoiPhanXa.updateOne({ _id: buoiId, userId }, { $set: { [`cau.${i}.dung`]: dung } });
    let daThuoc = false;
    if (!khongChac) {
        const td = await PhanXaTienDo.findOne({ userId, cauId: cau.id }).select('buoc').lean();
        const lich = capNhatLich(td, dung, now);
        daThuoc = lich.daThuoc;
        await PhanXaTienDo.updateOne(
            { userId, cauId: cau.id },
            { $set: { ...lich, khung: cau.khung }, $inc: dung ? { dung: 1 } : { sai: 1 } },
            { upsert: true },
        );
    }
    return { dung, khongChac, boQua: !chu, cauDung: cau.en, ghiChu, daThuoc };
}

module.exports = { tongQuan, taoBuoi, traLoi, chuanHoa, khopKho, capNhatLich, chonCau, SO_CAU, KHOANG };
