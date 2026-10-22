/**
 * Vai của AI theo Part: đề xuất (AI, chưa lưu), lưu vai AI, lưu/xoá vai riêng,
 * dọn khi Part mất.
 *
 * Mỗi vai có hai phần:
 *   · title — tiêu đề ngắn để người học nhận ra vai (vd "Barista at a café").
 *   · text  — mô tả ngắn: AI đóng vai ai, nói với ai. Đây là phần đi vào prompt.
 *
 * Quy tắc:
 *   · Đề xuất chỉ trả về BẢN NHÁP, không ghi DB. Mỗi lần bấm là một bản nháp mới.
 *   · "Lưu vai AI" tạo MỘT vai đã lưu cho Part. Trùng tiêu đề + mô tả thì không lưu
 *     thêm (so khớp bằng hash). Mỗi Part giữ tối đa MAX_VAI_AI_DA_LUU vai.
 *   · Vai đang dùng là vai riêng của người học nếu có, không thì vai AI lưu gần nhất.
 *   · Part không còn trong kho thì mọi vai của Part đó bị dọn khi có ai hỏi tới.
 */
const crypto = require('crypto');
const AiRole = require('../models/AiRole');
const Vocabulary = require('../models/Vocabulary');
const VocabularyZh = require('../models/VocabularyZh');
const UserUpload = require('../models/UserUpload');
const { textCompletion } = require('./aiClient');
const logger = require('../utils/logger');

const DO_DAI_TOI_THIEU = 10;
const DO_DAI_TOI_DA = 400;
const TIEU_DE_TOI_THIEU = 2;
const TIEU_DE_TOI_DA = 80;
/** Mô tả vai AI tối đa 120 ký tự — vai này đi vào MỌI phiên của Part, nên ngắn là tiết kiệm token. */
const DO_DAI_VAI_AI = 120;
/** Số vai AI đã lưu tối đa cho mỗi Part. */
const MAX_VAI_AI_DA_LUU = 10;

function rutGonVai(text) {
    if (text.length <= DO_DAI_VAI_AI) return text;
    const cat = text.slice(0, DO_DAI_VAI_AI);
    const cham = cat.lastIndexOf(' ');
    return (cham > 40 ? cat.slice(0, cham) : cat).replace(/[ ,;:]+$/, '');
}

function loiNhap(message) {
    const e = new Error(message);
    e.statusCode = 400;
    return e;
}

/** Gom khoảng trắng và bỏ ký tự điều khiển. */
function lamSach(raw) {
    return String(raw || '')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Mô tả vai: bỏ ký tự điều khiển, gom khoảng trắng, kiểm độ dài. */
function chuanHoaVaiText(raw) {
    const text = lamSach(raw);
    if (text.length < DO_DAI_TOI_THIEU) throw loiNhap(`Mô tả vai cần ít nhất ${DO_DAI_TOI_THIEU} ký tự.`);
    if (text.length > DO_DAI_TOI_DA) throw loiNhap(`Mô tả vai dài quá ${DO_DAI_TOI_DA} ký tự.`);
    return text;
}

/** Tiêu đề: ngắn, không rỗng. Thiếu thì lấy 6 chữ đầu của mô tả. */
function chuanHoaTieuDe(raw, moTa = '') {
    let t = lamSach(raw);
    if (!t) t = moTa.split(' ').slice(0, 6).join(' ');
    if (t.length < TIEU_DE_TOI_THIEU) throw loiNhap(`Tiêu đề cần ít nhất ${TIEU_DE_TOI_THIEU} ký tự.`);
    if (t.length > TIEU_DE_TOI_DA) throw loiNhap(`Tiêu đề dài quá ${TIEU_DE_TOI_DA} ký tự.`);
    return t;
}

/** Dấu vân tay tiêu đề + mô tả: không phân biệt hoa thường và khoảng trắng thừa. */
function hashVai(title, text) {
    return crypto.createHash('sha1')
        .update(`${lamSach(title)}|${lamSach(text)}`.toLowerCase())
        .digest('hex');
}

/**
 * Tách kết quả AI thành tiêu đề và mô tả. AI được yêu cầu hai dòng TITLE và ROLE;
 * nếu không đúng định dạng thì coi cả câu là mô tả, tiêu đề lấy 6 chữ đầu.
 */
function tachKetQuaAI(raw) {
    const text = lamSach(raw);
    const m = String(raw || '').match(/TITLE:\s*([^\n]+)\n+\s*ROLE:\s*([\s\S]+)/i);
    if (m) {
        return { title: lamSach(m[1]).slice(0, TIEU_DE_TOI_DA), text: lamSach(m[2]) };
    }
    return { title: text.split(' ').slice(0, 6).join(' ').slice(0, TIEU_DE_TOI_DA), text };
}

/** Khoá Part hợp lệ: source và part là chuỗi ngắn, không rỗng. */
function chuanHoaKhoa({ source, part, lang }) {
    const s = String(source || '').trim().toLowerCase();
    const p = String(part || '').trim();
    if (!s || !p) throw loiNhap('Thiếu đề (source) hoặc Part.');
    if (s.length > 100 || p.length > 200) throw loiNhap('Đề hoặc Part quá dài.');
    const ngonNgu = lang === 'zh' || lang === 'bi' ? lang : 'en';
    return { source: s, part: p, lang: ngonNgu };
}

/**
 * Part còn tồn tại trong kho không — kho chung (theo ngôn ngữ) HOẶC kho riêng của
 * người dùng. Dùng để quyết định có dọn vai hay không.
 */
async function partConTonTai({ source, part, lang, email }) {
    const Shared = lang === 'zh' ? VocabularyZh : Vocabulary;
    const [shared, mine] = await Promise.all([
        Shared.exists({ source, part }),
        email ? UserUpload.exists({ source, part, lang, ownerEmail: email }) : null,
    ]);
    return !!(shared || mine);
}

/** Xoá mọi vai của một Part (dùng khi Part đã biến mất). */
async function donVaiCuaPart(khoa) {
    const r = await AiRole.deleteMany(khoa);
    if (r.deletedCount) logger.info('Dọn vai AI của Part đã mất', { ...khoa, soVai: r.deletedCount });
    return r.deletedCount || 0;
}

/**
 * Vai đang áp dụng cho người này ở Part đó: vai riêng nếu có, không thì vai AI
 * lưu gần nhất, không thì null. Part đã mất thì dọn luôn và trả null.
 */
async function layVai({ userId, email, source, part, lang }) {
    const khoa = chuanHoaKhoa({ source, part, lang });
    if (!(await partConTonTai({ ...khoa, email }))) {
        await donVaiCuaPart(khoa);
        return { title: '', vai: null, nguon: null };
    }
    const cua = await AiRole.findOne({ ...khoa, origin: 'user', ownerId: userId }).lean();
    if (cua) return { title: cua.title || '', vai: cua.text, nguon: 'user' };
    const ai = await AiRole.findOne({ ...khoa, origin: 'ai' }).sort({ updatedAt: -1 }).lean();
    if (ai) return { title: ai.title || '', vai: ai.text, nguon: 'ai' };
    return { title: '', vai: null, nguon: null };
}

/**
 * Nhờ AI viết MỘT bản nháp vai (tiêu đề + mô tả) cho Part. KHÔNG lưu — người học
 * xem rồi mới bấm "Lưu vai AI". Mỗi lần gọi là một lần gọi AI.
 */
async function deXuatVaiAI({ userId, email, source, part, lang }) {
    const khoa = chuanHoaKhoa({ source, part, lang });
    if (!(await partConTonTai({ ...khoa, email }))) {
        await donVaiCuaPart(khoa);
        throw loiNhap('Part này không còn trong kho.');
    }

    const SharedModel = khoa.lang === 'zh' ? VocabularyZh : Vocabulary;
    const mau = await SharedModel.find({ source: khoa.source, part: khoa.part })
        .select(khoa.lang === 'zh' ? 'zh' : 'en')
        .limit(8)
        .lean();
    const tu = mau.map((w) => (khoa.lang === 'zh' ? w.zh : w.en)).filter(Boolean);

    const out = await textCompletion({
        feature: 'role-suggest',
        messages: [
            {
                role: 'system',
                // Ngắn là cốt lõi: vai này đi vào MỌI phiên của Part, nên dài là tốn token.
                content: [
                    'Write a short role for a speaking-practice chat, in exactly two lines:',
                    'TITLE: a title of at most 6 words (e.g. "Barista at a café").',
                    'ROLE: one sentence of at most 15 words: who the AI plays and who it talks to.',
                    'No quotes, no extra text.',
                ].join('\n'),
            },
            { role: 'user', content: `Words: ${tu.join(', ') || khoa.part}` },
        ],
        maxTokens: 60,
        temperature: 0.7,
        userId,
    });

    const { title, text } = tachKetQuaAI(out.text);
    const moTa = rutGonVai(chuanHoaVaiText(text));
    return { title: chuanHoaTieuDe(title, moTa), vai: moTa, nguon: 'nhap' };
}

/**
 * Lưu MỘT vai AI cho Part (sau khi người học đã xem bản nháp). Trùng tiêu đề và mô
 * tả với vai đã lưu thì không tạo thêm; vai này trở thành vai đang dùng của Part.
 */
async function luuVaiAI({ email, source, part, lang, title, text }) {
    const khoa = chuanHoaKhoa({ source, part, lang });
    const moTa = rutGonVai(chuanHoaVaiText(text));
    const tieuDe = chuanHoaTieuDe(title, moTa);
    if (!(await partConTonTai({ ...khoa, email }))) {
        await donVaiCuaPart(khoa);
        throw loiNhap('Part này không còn trong kho.');
    }

    const hash = hashVai(tieuDe, moTa);
    const trung = await AiRole.findOne({ ...khoa, origin: 'ai', hash }).lean();
    if (trung) {
        // Đã có: đẩy lên thành vai đang dùng, không tạo bản thứ hai.
        await AiRole.updateOne({ _id: trung._id }, { $set: { updatedAt: new Date() } });
        return { title: trung.title || tieuDe, vai: trung.text, nguon: 'ai', trung: true };
    }

    try {
        await AiRole.create({ ...khoa, origin: 'ai', ownerId: null, title: tieuDe, text: moTa, hash });
    } catch (err) {
        // Hai người cùng lưu một vai: chỉ bản đầu được tạo, bản sau coi như trùng.
        if (err?.code === 11000) {
            const co = await AiRole.findOne({ ...khoa, origin: 'ai', hash }).lean();
            return { title: co?.title || tieuDe, vai: co?.text || moTa, nguon: 'ai', trung: true };
        }
        throw err;
    }

    // Giữ tối đa MAX_VAI_AI_DA_LUU vai, bỏ bản cũ nhất.
    const dsCu = await AiRole.find({ ...khoa, origin: 'ai' })
        .sort({ updatedAt: -1 }).skip(MAX_VAI_AI_DA_LUU).select('_id').lean();
    if (dsCu.length) {
        await AiRole.deleteMany({ _id: { $in: dsCu.map((r) => r._id) } });
    }
    return { title: tieuDe, vai: moTa, nguon: 'ai', trung: false };
}

/** Người dùng tự viết vai (tiêu đề + mô tả) cho Part. Thay vai AI của Part với người này. */
async function luuVaiNguoiDung({ userId, email, source, part, lang, title, text }) {
    const khoa = chuanHoaKhoa({ source, part, lang });
    const moTa = chuanHoaVaiText(text);
    const tieuDe = chuanHoaTieuDe(title, moTa);
    if (!(await partConTonTai({ ...khoa, email }))) {
        await donVaiCuaPart(khoa);
        throw loiNhap('Part này không còn trong kho.');
    }
    await AiRole.updateOne(
        { ...khoa, origin: 'user', ownerId: userId },
        { $set: { title: tieuDe, text: moTa } },
        { upsert: true },
    );
    return { title: tieuDe, vai: moTa, nguon: 'user' };
}

/** Xoá vai riêng của người dùng. Vai AI đã lưu không bị xoá ở đây. */
async function xoaVaiNguoiDung({ userId, source, part, lang }) {
    const khoa = chuanHoaKhoa({ source, part, lang });
    const r = await AiRole.deleteOne({ ...khoa, origin: 'user', ownerId: userId });
    return { daXoa: r.deletedCount === 1 };
}

module.exports = {
    chuanHoaVaiText,
    chuanHoaTieuDe,
    tachKetQuaAI,
    rutGonVai,
    hashVai,
    chuanHoaKhoa,
    partConTonTai,
    layVai,
    deXuatVaiAI,
    luuVaiAI,
    luuVaiNguoiDung,
    xoaVaiNguoiDung,
    donVaiCuaPart,
    MAX_VAI_AI_DA_LUU,
};
