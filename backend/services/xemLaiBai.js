/**
 * XEM LẠI BÀI ĐÃ SỬA — người học sửa cả bài theo lời chữa rồi nộp lại.
 *
 * KHÔNG chấm lại từ đầu: AI chỉ nhận danh sách lỗi đã chữa + bài đã sửa, và trả lời
 * từng lỗi đã hết chưa, cộng tối đa 3 lỗi MỚI phát sinh lúc sửa. Không điểm, không
 * XP — nộp đi nộp lại không "cày" được gì, và lượt gọi rẻ hơn lượt chấm nhiều.
 *
 * Chặn trước khi gọi AI (miễn phí): bài không đổi chữ nào, hết lượt xem lại.
 */
const { parseJson } = require('./essayGrader');
const { chuanHoaLoai, chuanHoaMuc, chiThiPhanLoai, chiThiChuaBai } = require('./errorTaxonomy');

// Nạp trễ như các bộ chấm khác: nạp module không được khởi tạo client AI.
function chatCompletion(...args) {
    return require('../config/openai').chatCompletion(...args);
}

/** Số lần xem lại tối đa cho MỘT bài. */
const MAX_XEM_LAI = 3;
/** Số lỗi cũ tối đa gửi AI (đủ cho mọi bài: bộ chấm trả ≤ 12). */
const MAX_LOI = 12;

const TRANG_THAI = ['da-sua', 'chua-sua', 'sua-khac'];

/** So "đã đổi chưa" bỏ qua khác biệt khoảng trắng. */
const gon = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const khongDoi = (a, b) => gon(a) === gon(b);

function promptXemLai({ lang, kieu, passage }) {
    const L = lang === 'zh' ? 'Chinese' : 'English';
    return [
        `You are a ${L} teacher checking a learner's REVISION of their ${kieu === 'dich' ? 'translation' : 'writing'}.`,
        'You get the list of mistakes marked earlier (numbered) and the revised text.',
        'For EACH numbered mistake decide:',
        '  "da-sua"   — fixed correctly,',
        '  "chua-sua" — still there or still wrong,',
        '  "sua-khac" — changed in a different but acceptable way.',
        'Then list at most 3 NEW real mistakes introduced in the revision (ignore old ones). Do not re-mark style preferences.',
        'Do NOT give scores.',
        'Return ONLY valid JSON, no markdown:',
        '{"old":[{"n":1,"status":"da-sua","note":"<short Vietnamese note>"}],"new":[{"quote":"...","issue":"<Vietnamese>","fix":"...","type":"...","level":"error|style"}]}',
        chiThiPhanLoai(),
        chiThiChuaBai('fix'),
        passage ? `(Vietnamese source of the translation, for meaning only: ${String(passage).slice(0, 1500)})` : '',
    ].filter(Boolean).join('\n');
}

/** Chuẩn hoá kết quả AI — không tin hình dạng, số thứ tự hay trạng thái. */
function chuanHoaKetQua(obj, soLoi) {
    if (!obj || typeof obj !== 'object') return null;
    const theoSo = new Map();
    for (const o of Array.isArray(obj.old) ? obj.old : []) {
        const n = Number(o?.n);
        if (!Number.isInteger(n) || n < 1 || n > soLoi || theoSo.has(n)) continue;
        theoSo.set(n, {
            trangThai: TRANG_THAI.includes(o?.status) ? o.status : 'chua-sua',
            ghiChu: String(o?.note || '').slice(0, 300),
        });
    }
    // Lỗi AI bỏ sót không trả lời → coi là CHƯA sửa: báo nhầm "đã sửa" tệ hơn.
    const loiCu = Array.from({ length: soLoi }, (_, i) => ({ i, ...(theoSo.get(i + 1) || { trangThai: 'chua-sua', ghiChu: '' }) }));
    const loiMoi = (Array.isArray(obj.new) ? obj.new : [])
        .slice(0, 3)
        .map((e) => ({
            quote: String(e?.quote || '').slice(0, 300),
            issue: String(e?.issue || '').slice(0, 500),
            fix: String(e?.fix || '').slice(0, 300),
            type: chuanHoaLoai(e?.type),
            muc: chuanHoaMuc(e?.level),
        }))
        .filter((e) => e.issue);
    return {
        loiCu,
        loiMoi,
        soDaSua: loiCu.filter((l) => l.trangThai !== 'chua-sua').length,
    };
}

/**
 * Xem lại một bài đã sửa.
 *
 * @param {object} o
 * @param {string}   o.goc      bài lúc nộp chấm (hoặc lần xem lại gần nhất)
 * @param {string}   o.sua      bài đã sửa
 * @param {object[]} o.loi      lỗi đã chữa (quote, issue, fix|better)
 * @returns {Promise<{success:boolean, ketQua?:object, error?:string, ma?:string}>}
 */
async function xemLaiBai({ goc, sua, loi = [], lang = 'en', kieu = 'viet', passage = '', userId = null }) {
    if (!gon(sua)) return { success: false, error: 'Bài sửa đang trống.', ma: 'trong' };
    if (khongDoi(goc, sua)) return { success: false, error: 'Bạn chưa sửa chữ nào so với lần trước.', ma: 'khong-doi' };

    const ds = (Array.isArray(loi) ? loi : []).slice(0, MAX_LOI);
    const danhSach = ds.map((l, i) => `${i + 1}. "${String(l?.quote || '').slice(0, 200)}" — ${String(l?.issue || '').slice(0, 200)}${(l?.fix ?? l?.better) ? ` (suggested: "${String(l.fix ?? l.better).slice(0, 200)}")` : ''}`).join('\n');

    const res = await chatCompletion([
        { role: 'system', content: promptXemLai({ lang, kieu, passage }) },
        { role: 'user', content: `MISTAKES MARKED EARLIER:\n${danhSach || '(none)'}\n\nREVISED TEXT:\n${String(sua).slice(0, 8000)}` },
    ], {
        maxTokens: 700,
        temperature: 0.2,
        feature: kieu === 'dich' ? 'translation-recheck' : 'essay-recheck',
        userId,
    });
    if (!res.success) return { success: false, error: 'AI chưa xem lại được, thử lại sau.', ma: 'ai' };
    const ketQua = chuanHoaKetQua(parseJson(res.content), ds.length);
    if (!ketQua) return { success: false, error: 'AI trả về kết quả không đọc được, thử lại sau.', ma: 'ai' };
    return { success: true, ketQua };
}

module.exports = { xemLaiBai, chuanHoaKetQua, khongDoi, MAX_XEM_LAI, MAX_LOI };
