/**
 * Vai của AI theo Part: lấy, đề xuất (AI), lưu/xoá (người dùng), dọn khi Part mất.
 *
 * Quy tắc:
 *   · Mỗi (source, part, lang) có tối đa một vai AI dùng chung. Chỉ gọi AI khi
 *     chưa có vai đó — các người dùng sau dùng lại, không tốn token.
 *   · Vai người dùng tự viết (origin 'user') thay vai AI của cùng Part, chỉ với
 *     người đó.
 *   · Part không còn tồn tại trong kho (đã bị xoá) thì mọi vai của Part đó bị xoá
 *     khi có ai hỏi tới.
 */
const AiRole = require('../models/AiRole');
const Vocabulary = require('../models/Vocabulary');
const VocabularyZh = require('../models/VocabularyZh');
const UserUpload = require('../models/UserUpload');
const { textCompletion } = require('./aiClient');
const logger = require('../utils/logger');

const DO_DAI_TOI_THIEU = 10;
const DO_DAI_TOI_DA = 400;

function loiNhap(message) {
    const e = new Error(message);
    e.statusCode = 400;
    return e;
}

/** Chuẩn hoá văn bản vai: bỏ ký tự điều khiển, gom khoảng trắng, kiểm độ dài. */
function chuanHoaVaiText(raw) {
    const text = String(raw || '')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (text.length < DO_DAI_TOI_THIEU) throw loiNhap(`Vai cần ít nhất ${DO_DAI_TOI_THIEU} ký tự.`);
    if (text.length > DO_DAI_TOI_DA) throw loiNhap(`Vai dài quá ${DO_DAI_TOI_DA} ký tự.`);
    return text;
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
 * Vai đang áp dụng cho người này ở Part đó: vai riêng nếu có, không thì vai AI,
 * không thì null. Part đã mất thì dọn luôn và trả null.
 */
async function layVai({ userId, email, source, part, lang }) {
    const khoa = chuanHoaKhoa({ source, part, lang });
    if (!(await partConTonTai({ ...khoa, email }))) {
        await donVaiCuaPart(khoa);
        return { vai: null, nguon: null };
    }
    const cua = await AiRole.findOne({ ...khoa, origin: 'user', ownerId: userId }).lean();
    if (cua) return { vai: cua.text, nguon: 'user' };
    const ai = await AiRole.findOne({ ...khoa, origin: 'ai', ownerId: null }).lean();
    if (ai) return { vai: ai.text, nguon: 'ai' };
    return { vai: null, nguon: null };
}

/**
 * Nhờ AI đề xuất vai cho Part. Nếu đã có vai AI cho Part thì trả lại, KHÔNG gọi AI.
 * Gọi AI chỉ một lần cho mỗi Part trên toàn hệ thống.
 */
async function deXuatVaiAI({ userId, email, source, part, lang }) {
    const khoa = chuanHoaKhoa({ source, part, lang });
    if (!(await partConTonTai({ ...khoa, email }))) {
        await donVaiCuaPart(khoa);
        throw loiNhap('Part này không còn trong kho.');
    }
    const co = await AiRole.findOne({ ...khoa, origin: 'ai', ownerId: null }).lean();
    if (co) return { vai: co.text, nguon: 'ai', daCo: true };

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
                content: 'You design one speaking-practice role for a language learner. Reply with ONE sentence only: who the AI plays and who it talks to, in the everyday situation implied by the words. No quotes, no list.',
            },
            { role: 'user', content: `Words: ${tu.join(', ') || khoa.part}` },
        ],
        maxTokens: 120,
        temperature: 0.7,
        userId,
    });

    const text = chuanHoaVaiText(out.text);
    // upsert để hai người cùng lúc không tạo hai vai AI cho một Part.
    await AiRole.updateOne(
        { ...khoa, origin: 'ai', ownerId: null },
        { $setOnInsert: { ...khoa, origin: 'ai', ownerId: null, text } },
        { upsert: true },
    );
    const luu = await AiRole.findOne({ ...khoa, origin: 'ai', ownerId: null }).lean();
    return { vai: luu.text, nguon: 'ai', daCo: false };
}

/** Người dùng tự viết vai cho Part. Thay vai AI của Part đó đối với người này. */
async function luuVaiNguoiDung({ userId, email, source, part, lang, text }) {
    const khoa = chuanHoaKhoa({ source, part, lang });
    const sach = chuanHoaVaiText(text);
    if (!(await partConTonTai({ ...khoa, email }))) {
        await donVaiCuaPart(khoa);
        throw loiNhap('Part này không còn trong kho.');
    }
    await AiRole.updateOne(
        { ...khoa, origin: 'user', ownerId: userId },
        { $set: { text: sach } },
        { upsert: true },
    );
    return { vai: sach, nguon: 'user' };
}

/** Xoá vai riêng của người dùng. Vai AI dùng chung không bị xoá ở đây. */
async function xoaVaiNguoiDung({ userId, source, part, lang }) {
    const khoa = chuanHoaKhoa({ source, part, lang });
    const r = await AiRole.deleteOne({ ...khoa, origin: 'user', ownerId: userId });
    return { daXoa: r.deletedCount === 1 };
}

module.exports = {
    chuanHoaVaiText,
    chuanHoaKhoa,
    partConTonTai,
    layVai,
    deXuatVaiAI,
    luuVaiNguoiDung,
    xoaVaiNguoiDung,
    donVaiCuaPart,
};
