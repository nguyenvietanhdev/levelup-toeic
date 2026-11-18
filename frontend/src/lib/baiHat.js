/**
 * Hàm thuần cho Học qua bài hát: chia dòng lời thành chữ để tô màu kiểu karaoke, tạo ô trống
 * cho chế độ điền từ, so câu trả lời.
 *
 * Kho lời thường chỉ có mốc theo DÒNG. Để màu chạy qua từng chữ, thời điểm của mỗi chữ được
 * ƯỚC LƯỢNG: chia thời gian hát của dòng theo số âm tiết (tiếng Anh) hoặc số chữ Hán (tiếng
 * Trung). Bản lời có mốc từng chữ (`cau.tu`) thì dùng đúng mốc đó.
 */

const RE_HAN = /[一-鿿]/;
/** Một âm tiết hát mất chừng này giây; dòng ngắn mà mốc dòng sau ở xa (đoạn dạo nhạc) thì chữ
 * không bị kéo dài hết khoảng lặng. */
export const GIAY_MOI_AM = 0.42;

/** Số âm tiết ước lượng của một từ tiếng Anh (thuần): đếm cụm nguyên âm, bỏ "e" câm cuối. */
export function soAmTiet(tu) {
    const t = String(tu || '').toLowerCase().replace(/[^a-z]/g, '');
    if (!t) return 0;
    const bot = t.length > 3 ? t.replace(/(?:[^laeiouy]es|[^laeiouy]e)$/, '').replace(/^y/, '') : t;
    return Math.max(1, (bot.match(/[aeiouy]+/g) || []).length);
}

/**
 * Chia một dòng thành các mẩu hiển thị (thuần). Mỗi mẩu: `hien` (giữ dấu câu, khoảng trắng),
 * `tu` (chữ để tra/điền, rỗng nếu chỉ là dấu câu), `nang` (số âm tiết để chia thời gian).
 * Tiếng Trung: mỗi chữ Hán một mẩu.
 */
export function tachMau(text, lang = 'en') {
    const s = String(text || '');
    if (lang === 'zh' || RE_HAN.test(s)) {
        return [...s].map((ch) => (RE_HAN.test(ch) ? { hien: ch, tu: ch, nang: 1 } : { hien: ch, tu: '', nang: 0 }));
    }
    return s.split(/(\s+)/).filter((p) => p !== '').map((p) => {
        const tu = p.replace(/^[^A-Za-z'’]+|[^A-Za-z'’]+$/g, '');
        return /[A-Za-z]/.test(tu) ? { hien: p, tu, nang: soAmTiet(tu) } : { hien: p, tu: '', nang: 0 };
    });
}

/**
 * Mẩu kèm thời điểm bắt đầu/kết thúc hát (thuần). `cau`: { batDau, ketThuc, text, tu? }.
 * Có mốc từng chữ thì mỗi mẩu là một mốc; không thì ước lượng theo âm tiết.
 */
export function mauCoGio(cau, lang = 'en') {
    if (!cau || cau.batDau == null) return tachMau(cau?.text, lang).map((m) => ({ ...m, batDau: null, ketThuc: null }));
    const het = cau.ketThuc ?? cau.batDau + 5;
    if (Array.isArray(cau.tu) && cau.tu.length) {
        return cau.tu.map((t, i) => {
            const sau = cau.tu[i + 1]?.batDau ?? Math.min(het, t.batDau + 1.2);
            const tu = String(t.text).trim().replace(/^[^\p{L}'’]+|[^\p{L}'’]+$/gu, '');
            return { hien: t.text, tu, nang: 1, batDau: t.batDau, ketThuc: Math.max(t.batDau + 0.05, sau) };
        });
    }
    const mau = tachMau(cau.text, lang);
    const tong = mau.reduce((n, m) => n + m.nang, 0) || 1;
    const thoiGianHat = Math.min(het - cau.batDau, tong * GIAY_MOI_AM + 0.3);
    const giayMoiAm = thoiGianHat / tong;
    let t = cau.batDau;
    return mau.map((m) => {
        const batDau = t;
        t += m.nang * giayMoiAm;
        return { ...m, batDau, ketThuc: m.nang ? t : batDau };
    });
}

/** Tô được bao nhiêu phần của một mẩu tại thời điểm `t`, 0..1 (thuần). */
export function tienDo(mau, t) {
    if (mau.batDau == null) return 0;
    if (t <= mau.batDau) return 0;
    if (t >= mau.ketThuc) return 1;
    return (t - mau.batDau) / (mau.ketThuc - mau.batDau);
}

/** Bộ sinh số giả ngẫu nhiên có hạt giống: cùng bài cùng mức thì ô trống không đổi khi vẽ lại. */
function sinhSo(hat) {
    let a = hat >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let x = a;
        x = Math.imul(x ^ (x >>> 15), x | 1);
        x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
}

const SO_TRONG = { de: () => 1, vua: () => 2, kho: (n) => Math.max(2, Math.round(n * 0.4)) };
const TU_NGAN = new Set(['the', 'and', 'you', 'are', 'for', 'but', 'was', 'not', 'can']);

/**
 * Chọn ô trống cho từng dòng (thuần): trả mảng, phần tử i là danh sách vị trí mẩu bị đục ở dòng i.
 * Mức Dễ ưu tiên từ dài (dễ nghe ra), bỏ từ quá ngắn; tiếng Trung đục từng chữ Hán.
 */
export function chonOTrong(dsCau, lang = 'en', mucDo = 'vua', hat = 1) {
    const rand = sinhSo(hat);
    return dsCau.map((c) => {
        const mau = tachMau(c.text, lang);
        const zh = lang === 'zh' || RE_HAN.test(c.text);
        let ung = mau.map((m, k) => ({ m, k })).filter(({ m }) => m.tu && (zh || (m.tu.length >= 3 && (mucDo !== 'de' || !TU_NGAN.has(m.tu.toLowerCase())))));
        if (!ung.length) return [];
        const n = Math.min(ung.length, (SO_TRONG[mucDo] || SO_TRONG.vua)(ung.length));
        if (mucDo === 'de' && !zh) ung = ung.sort((a, b) => b.m.tu.length - a.m.tu.length).slice(0, Math.max(n, 3));
        const tron = ung.map((x) => ({ x, r: rand() })).sort((a, b) => a.r - b.r).slice(0, n).map((y) => y.x.k);
        return tron.sort((a, b) => a - b);
    });
}

/** Chuẩn hoá để so chữ điền (thuần): không phân biệt hoa thường, dấu nháy, dấu câu. */
export const chuanHoaTu = (s) => String(s || '').toLowerCase().normalize('NFC').replace(/[’'`]/g, '').replace(/[^\p{L}\p{N}]/gu, '');

export const khopTu = (go, dapAn) => !!chuanHoaTu(go) && chuanHoaTu(go) === chuanHoaTu(dapAn);
