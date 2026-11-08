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
const { khungCua, TAT_CA, THEO_ID, QUY_TAC } = require('./phanXaKho');
const { parseJson } = require('./essayGrader');
const HoSoHocVien = require('../models/HoSoHocVien');
const { ghiKetQua, diemCua, NGUONG_YEU } = require('./hoSoHoc');
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

/**
 * Chuẩn hoá câu tiếng Trung để so (thuần): bỏ mọi khoảng trắng và dấu câu, cả dấu Trung.
 * Giọng nói không có dấu câu, và gõ "我 明天 在家" hay "我明天在家。" đều là một câu.
 */
function chuanHoaZh(s) {
    return String(s || '').normalize('NFC').replace(/[\s.,!?;:"'()，。！？；：、“”‘’（）…—·]/g, '');
}

/** Chuẩn hoá để so: bỏ hoa/thường, dấu câu, khác biệt viết tắt (giọng nói không có dấu câu). */
function chuanHoa(s) {
    let t = String(s || '').normalize('NFC').replace(/[‘’]/g, "'").toLowerCase();
    for (const [re, thay] of VIET_TAT) t = t.replace(re, thay);
    return t.replace(/[.,!?;:"()]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Khớp câu mẫu hoặc cách nói khác trong kho. */
function khopKho(traLoi, cau) {
    const ch = cau.lang === 'zh' ? chuanHoaZh : chuanHoa;
    const a = ch(traLoi);
    return !!a && [cau.en, ...(cau.chap || [])].some((x) => ch(x) === a);
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
function chonCau({ tienDo = [], khung = '', som = false, now = new Date(), soCau = SO_CAU, lang = 'en' }) {
    const theoId = new Map(tienDo.map((t) => [t.cauId, t]));
    const kho = TAT_CA.filter((c) => c.lang === (lang === 'zh' ? 'zh' : 'en') && (!khung || c.khung === khung));
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
async function aiCham(cau, traLoi, userId, lang = 'en') {
    const ngonNgu = lang === 'zh' ? 'Mandarin Chinese (simplified characters)' : 'English';
    const res = await chatCompletion([
        {
            role: 'system',
            content: [
                `A Vietnamese learner translated a short sentence into spoken ${ngonNgu}.`,
                `Decide: is it grammatical, natural ${ngonNgu} with the same meaning as the Vietnamese?`,
                'Ignore capitalization, punctuation and spacing: it may come from speech recognition.',
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

/**
 * Ngôn ngữ luyện, theo ngôn ngữ đang học từ vựng. Kho song ngữ (`bi`) học bằng tiếng Anh,
 * cùng quy ước với mọi chỗ khác (hồ sơ, tiến bộ, sổ tay lỗi).
 */
async function langCua(userId) {
    const p = await UserProfile.findOne({ userId }).select('settings').lean();
    return p?.settings?.vocabLang === 'zh' ? 'zh' : 'en';
}

/** Số câu mới / đến hạn / đã thuộc theo từng khung của ngôn ngữ đang học. */
async function tongQuan(userId, now = new Date()) {
    const lang = await langCua(userId);
    const bo = khungCua(lang);
    const ds = await PhanXaTienDo.find({ userId, khung: { $in: bo.map((k) => k.key) } }).select('cauId khung denHan daThuoc').lean();
    const khung = bo.map((k) => {
        const cua = ds.filter((t) => t.khung === k.key);
        const denHan = cua.filter((t) => new Date(t.denHan) <= now).length;
        return {
            key: k.key, ten: k.ten, icon: k.icon, moTa: k.moTa, tong: k.cau.length,
            moi: k.cau.length - cua.length, denHan, daThuoc: cua.filter((t) => t.daThuoc).length,
        };
    });
    return {
        hoTro: true,
        lang,
        khung,
        denHan: khung.reduce((s, k) => s + k.denHan, 0),
        moi: khung.reduce((s, k) => s + k.moi, 0),
        daThuoc: khung.reduce((s, k) => s + k.daThuoc, 0),
        tong: khung.reduce((s, k) => s + k.tong, 0),
    };
}

/** Chẩn đoán cho thấy chưa nắm hoặc mới bắt đầu nắm quy tắc. */
const MA_CAN_QUY_TAC = ['chua-nam', 'bat-dau-duoc'];

/**
 * Thẻ quy tắc cho các khung của lượt (thuần). `canXem`: thẻ tự hiện trước lượt, khi khung
 * bị chẩn đoán yếu về quy tắc và điểm vẫn thấp; luyện lên rồi thì không làm phiền nữa.
 */
function quyTacChoLuot(chon, hoSo) {
    const quyTac = {};
    for (const c of chon) quyTac[c.khung] = { ten: c.tenKhung, ...QUY_TAC[c.khung] };
    const canXem = (hoSo?.chanDoan || [])
        .filter((d) => quyTac[d.kyNang] && MA_CAN_QUY_TAC.includes(d.ma))
        .filter((d) => diemCua(hoSo?.kyNang?.[d.kyNang]) < NGUONG_YEU)
        .map((d) => d.kyNang);
    return { quyTac, canXem };
}

/** Mở một lượt. Client chỉ nhận câu tiếng Việt — đáp án trả về sau khi chấm từng câu. */
async function taoBuoi(userId, { khung = '', som = false } = {}, now = new Date()) {
    const lang = await langCua(userId);
    const k = khungCua(lang).some((x) => x.key === khung) ? khung : '';
    const tienDo = await PhanXaTienDo.find({ userId }).select('cauId denHan sai').lean();
    const chon = chonCau({ tienDo, khung: k, som, now, lang });
    if (!chon.length) return { buoi: null };
    const buoi = await BuoiPhanXa.create({ userId, cau: chon.map((c) => ({ cauId: c.id })) });
    // Không đọc được hồ sơ thì chỉ mất phần tự hiện thẻ, lượt luyện vẫn chạy.
    const doc = await HoSoHocVien.findOne({ userId }).select('chanDoan chanDoanZh kyNang').lean().catch(() => null);
    const hoSo = doc && { ...doc, chanDoan: lang === 'zh' ? (doc.chanDoanZh || []) : (doc.chanDoan || []) };
    return {
        buoi: {
            id: String(buoi._id),
            lang,
            cau: chon.map((c) => ({ vi: c.vi, khung: c.khung, tenKhung: c.tenKhung })),
            ...quyTacChoLuot(chon, hoSo),
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
            const r = await aiCham(cau, chu, userId, cau.lang);
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
        // Hồ sơ lỗi không được làm hỏng lượt luyện. Chỉ câu thật sự NÓI mới tính kỹ năng Nói,
        // và vào đúng kỹ năng Nói của ngôn ngữ đó (hồ sơ Giao tiếp và nền tảng HSK tách riêng).
        await ghiKetQua(userId, [
            { kyNang: cau.khung, dung },
            ...(body.cach === 'noi' && chu ? [{ kyNang: cau.lang === 'zh' ? 'zh-noi' : 'noi', dung }] : []),
        ], now).catch((e) => logger.warn('Phản xạ câu: không ghi được hồ sơ', { message: e?.message }));
    }
    return { dung, khongChac, boQua: !chu, cauDung: cau.en, ...(cau.py ? { pinyin: cau.py } : {}), ghiChu, daThuoc };
}

module.exports = {
    tongQuan, taoBuoi, traLoi, chuanHoa, chuanHoaZh, khopKho, aiCham, capNhatLich, chonCau, quyTacChoLuot, SO_CAU, KHOANG,
};
