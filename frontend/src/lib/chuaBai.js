/**
 * LÕI CHỮA BÀI — định vị lỗi trong bài làm, ghép bản đã sửa, so câu tự sửa.
 *
 * Thuần (không React) để test kỹ: đây là chỗ dễ sai nhất — trích dẫn lệch một chữ,
 * hai lỗi chồng lên nhau, hay cụm sửa là lời giải thích tiếng Việt (bài chấm cũ)
 * đều làm bài "đã sửa" hỏng mà không báo gì.
 */

/** Nhãn tiếng Việt của nhóm lỗi — khớp `LOAI_LOI` ở backend/services/errorTaxonomy.js. */
export const LOAI_LOI = {
    article: 'Mạo từ (a/an/the)',
    tense: 'Thì của động từ',
    agreement: 'Hoà hợp chủ ngữ – động từ',
    preposition: 'Giới từ',
    'word-order': 'Trật tự từ',
    'word-choice': 'Chọn từ chưa đúng',
    plural: 'Số ít / số nhiều',
    spelling: 'Chính tả',
    punctuation: 'Dấu câu',
    other: 'Khác',
};

export const nhanLoai = (k) => LOAI_LOI[k] || LOAI_LOI.other;

/** Bỏ dấu tiếng Việt? Có ký tự riêng của tiếng Việt → chuỗi là tiếng Việt. */
const RE_VIET = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
export const coTiengViet = (s) => RE_VIET.test(String(s || ''));

/**
 * Chuẩn hoá một lỗi từ hai nguồn (Viết: `fix`, `type`; Dịch: `better`, `loai`).
 *
 * `suaDuoc`: cụm sửa dùng làm chữ THAY THẾ được không. Bài chấm cũ ghi `fix` bằng
 * tiếng Việt (lời giải thích) — ghép vào bài tiếng Anh là ra câu lai, nên với bài
 * không phải tiếng Việt mà cụm sửa có dấu tiếng Việt thì chỉ hiện như lời ghi chú.
 */
export function chuanHoaLoi(raw, i) {
    const sua = String(raw?.fix ?? raw?.better ?? '').trim();
    const loai = raw?.loai ?? raw?.type ?? 'other';
    return {
        id: raw?.id ?? `loi-${i}`,
        quote: String(raw?.quote || '').trim(),
        issue: String(raw?.issue || ''),
        sua,
        loai: LOAI_LOI[loai] ? loai : 'other',
        muc: raw?.muc === 'nen' || raw?.level === 'style' ? 'nen' : 'loi',
        suaDuoc: !!sua && !coTiengViet(sua),
    };
}

/**
 * Tìm vị trí từng lỗi trong bài. Thử khớp đúng chữ hoa/thường trước, rồi không
 * phân biệt, rồi bỏ qua khác biệt KHOẢNG TRẮNG (AI trích "Hello Anna! My name…"
 * trên một dòng trong khi bài xuống dòng giữa hai câu). Hai lỗi không được chồng
 * lên nhau: chỗ đã có lỗi khác thì tìm lần xuất hiện kế tiếp; hết chỗ thì xếp vào
 * `khongThay` (vẫn hiện, chỉ không gạch chân).
 *
 * @returns {{ doan: Array<{start:number,end:number,loi:object}>, khongThay: object[] }}
 */
export function dinhViLoi(text, dsLoi) {
    const goc = String(text || '');
    const thuong = goc.toLowerCase();
    const doan = [];
    const khongThay = [];
    const chong = (s, e) => doan.some((d) => s < d.end && e > d.start);

    for (const loi of dsLoi) {
        const q = loi.quote;
        if (!q) { khongThay.push(loi); continue; }
        let viTri = -1;
        let dai = q.length;
        for (const [nguon, tim] of [[goc, q], [thuong, q.toLowerCase()]]) {
            let tu = nguon.indexOf(tim);
            while (tu >= 0 && chong(tu, tu + tim.length)) tu = nguon.indexOf(tim, tu + 1);
            if (tu >= 0) { viTri = tu; break; }
        }
        if (viTri < 0) {
            // Khoảng trắng bất kỳ (cách, xuống dòng) khớp nhau; độ dài lấy theo chỗ khớp thật.
            const mau = q.split(/\s+/).filter(Boolean).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
            const re = new RegExp(mau, 'giu');
            for (const m of goc.matchAll(re)) {
                if (!chong(m.index, m.index + m[0].length)) { viTri = m.index; dai = m[0].length; break; }
            }
        }
        if (viTri < 0) khongThay.push(loi);
        else doan.push({ start: viTri, end: viTri + dai, loi });
    }
    doan.sort((a, b) => a.start - b.start);
    return { doan, khongThay };
}

/** Cắt bài thành các mảnh: chữ thường xen với mảnh có lỗi. */
export function chiaManh(text, doan) {
    const goc = String(text || '');
    const out = [];
    let tu = 0;
    for (const d of doan) {
        if (d.start > tu) out.push({ chu: goc.slice(tu, d.start) });
        out.push({ chu: goc.slice(d.start, d.end), loi: d.loi });
        tu = d.end;
    }
    if (tu < goc.length) out.push({ chu: goc.slice(tu) });
    return out;
}

/** Chuẩn hoá để so câu tự sửa: bỏ hoa/thường, khoảng trắng thừa, dấu câu cuối, nháy cong. */
export function chuanHoaSo(s) {
    return String(s || '')
        .normalize('NFC')
        .replace(/[‘’]/g, "'")
        .replace(/[“”]/g, '"')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[\s.,!?;:。，！？；：]+$/u, '');
}

/** Câu người học tự sửa có khớp cách sửa không. */
export function khopSua(nhap, sua) {
    const a = chuanHoaSo(nhap);
    return !!a && a === chuanHoaSo(sua);
}

/**
 * Chọn lỗi để HIỆN khi chưa bấm "Xem tất cả": lỗi thật trước, nên-sửa sau, tối đa
 * `toiDa`. Bài đỏ kín trang thì người học nản và không nhớ được gì.
 */
export function chonHien(dsLoi, toiDa = 8) {
    const loi = dsLoi.filter((l) => l.muc === 'loi');
    const nen = dsLoi.filter((l) => l.muc !== 'loi');
    return new Set([...loi, ...nen].slice(0, toiDa).map((l) => l.id));
}
