/**
 * Phần dùng chung cho "kho dạng bài" của các chế độ AI (Đọc hiểu, Viết, Dịch, Nghe).
 *
 * Mỗi chế độ tự khai báo kho của mình dạng:
 *   [{ key, vi, hop: [kiểu chấm…], dang: [{ key, vi, en }] }]
 * `en` là cụm mô tả đưa vào prompt; `hop` là các kiểu chấm nhóm đó hợp nhất.
 * File này lo phần giống nhau: làm sạch chuỗi tự nhập, tìm dạng, bốc ngẫu nhiên.
 */

/** Độ dài tối đa của dạng bài tự nhập — khớp MAX_TU_CHON ở frontend/src/components/ai/ChonDangBai.jsx. */
const MAX_TU_CHON = 60;

/**
 * Chuẩn hoá dạng bài/chủ đề người học tự nhập. Chuỗi này đi thẳng vào prompt,
 * nên chỉ giữ chữ (mọi thứ tiếng), số, khoảng trắng và vài dấu câu thường, gộp
 * khoảng trắng và cắt độ dài — xuống dòng hay dấu ngoặc kép là cách chèn chỉ thị.
 */
function chuanHoaTuChon(v) {
    if (typeof v !== 'string') return '';
    const s = v.replace(/[^\p{L}\p{N} ,.'&/()-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TU_CHON).trim();
    return s.length >= 2 ? s : '';
}

/** Mọi dạng trong kho, phẳng. */
function phang(nhom) {
    return nhom.flatMap((n) => n.dang);
}

/** Dạng có khoá `key` trong kho, hoặc null. */
function timDang(nhom, key) {
    const k = String(key || '').trim().toLowerCase();
    return phang(nhom).find((d) => d.key === k) || null;
}

/** Bốc ngẫu nhiên một dạng trong các nhóm hợp với kiểu chấm (không có nhóm nào → cả kho). */
function ngauNhienTheoKieu(nhom, kieu) {
    const hop = nhom.filter((n) => n.hop.includes(kieu)).flatMap((n) => n.dang);
    const ds = hop.length ? hop : phang(nhom);
    return ds[Math.floor(Math.random() * ds.length)];
}

/**
 * Dạng người học đã chọn: tự nhập thắng, rồi tới khoá hợp lệ trong kho.
 * Trả `null` khi là "Ngẫu nhiên" — để nơi gọi tự quyết ngẫu nhiên kiểu gì.
 * Dạng tự nhập trả `{ key: 'custom', vi: <chuỗi>, en: <cụm cho prompt> }`.
 */
function chonDang(nhom, { dang, tuChon } = {}) {
    const tu = chuanHoaTuChon(tuChon);
    if (tu) return { key: 'custom', vi: tu, en: `text of this type or topic: "${tu}"` };
    return timDang(nhom, dang);
}

module.exports = { MAX_TU_CHON, chuanHoaTuChon, phang, timDang, ngauNhienTheoKieu, chonDang };
