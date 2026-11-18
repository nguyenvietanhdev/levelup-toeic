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
    const bot = t.length > 2 ? t.replace(/(?:[^laeiouy]es|[^laeiouy]e)$/, '').replace(/^y/, '') : t;
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

const tongAm = (text, lang) => tachMau(text, lang).reduce((n, m) => n + m.nang, 0);

/**
 * Tốc độ hát RIÊNG của một bài: số giây cho mỗi âm tiết (thuần). Con số cố định cho mọi bài làm
 * bài nhanh (rap) bị tô chậm, bài chậm (ballad) bị tô vụt qua rồi đứng chờ.
 *
 * Lấy từ chính các dòng của bài: thời lượng dòng / số âm tiết. Dòng có đoạn dạo nhạc chen giữa thì
 * tỉ số bị đội lên, nên lấy mức thấp (phân vị 35%) thay vì trung bình. Ít dòng quá thì dùng mặc định.
 */
export function tocDoBai(dsCau, lang = 'en') {
    const tiSo = (dsCau || [])
        .filter((c) => c.batDau != null && c.ketThuc != null)
        .map((c) => ({ n: tongAm(c.text, lang), d: c.ketThuc - c.batDau }))
        .filter((x) => x.n >= 3 && x.d > 0)
        .map((x) => x.d / x.n)
        .sort((a, b) => a - b);
    if (tiSo.length < 3) return GIAY_MOI_AM;
    const v = tiSo[Math.floor((tiSo.length - 1) * 0.35)];
    return Math.min(0.9, Math.max(0.15, v));
}

/** Dấu ngắt hơi giữa dòng: sau dấu này người hát thường dừng một nhịp ngắn. */
const RE_NGAT = /[,;:—–，、；：]\s*$/;
/** Khoảng ngắt sau dấu phẩy, tính bằng số âm tiết. */
const AM_NGAT = 0.5;

/**
 * Mẩu kèm thời điểm bắt đầu/kết thúc hát (thuần). `cau`: { batDau, ketThuc, text, tu? }.
 * Có mốc từng chữ thì mỗi mẩu là một mốc; không thì ước lượng:
 *   · mỗi âm tiết `giayMoiAm` giây (tốc độ riêng của bài, xem tocDoBai);
 *   · sau dấu phẩy dừng nửa âm tiết;
 *   · dòng hát dồn hơn thời gian có thì nén lại cho vừa;
 *   · còn dư thời gian trước dòng sau thì chữ CUỐI dòng được ngân dài thêm (tối đa vài âm tiết),
 *     đúng cách người ta hát, thay vì tô xong rồi đứng im.
 */
export function mauCoGio(cau, lang = 'en', giayMoiAm = GIAY_MOI_AM) {
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
    const iCuoi = mau.reduce((k, m, i) => (m.nang ? i : k), -1);
    const ngat = mau.map((m, i) => (m.nang && i !== iCuoi && RE_NGAT.test(m.hien) ? AM_NGAT : 0));
    const tong = mau.reduce((n, m, i) => n + m.nang + ngat[i], 0) || 1;
    const co = het - cau.batDau;
    const can = tong * giayMoiAm;
    const giay = can > co ? co / tong : giayMoiAm;
    const ngan = can < co ? Math.min(co - can, Math.max(0.5, 3 * giayMoiAm)) : 0;
    let t = cau.batDau;
    return mau.map((m, i) => {
        const batDau = t;
        t += m.nang * giay;
        const ketThuc = m.nang ? t + (i === iCuoi ? ngan : 0) : batDau;
        t += ngat[i] * giay;
        return { ...m, batDau, ketThuc };
    });
}

// ---------- Độ lệch theo từng đoạn ("Chạm để khớp lại") ----------

/**
 * Độ lệch áp cho dòng `i` (thuần): mốc chỉnh gần nhất ở dòng ≤ i, không có thì độ lệch chung.
 * `lechTu`: [{ dong, lech }] — từ dòng `dong` trở đi cộng `lech` giây. Nhờ vậy bài lệch TĂNG DẦN
 * (bản thu khác bản video) vẫn khớp được, điều một con số cho cả bài không làm được.
 */
export function lechCua(i, lech = 0, lechTu = []) {
    let v = lech || 0;
    for (const m of lechTu || []) if (m.dong <= i) v = m.lech;
    return v;
}

/** Lời sau khi cộng độ lệch từng đoạn (thuần); dòng không được kéo dài đè lên dòng sau. */
export function apLech(dsCau, lech = 0, lechTu = []) {
    const lechSap = [...(lechTu || [])].sort((a, b) => a.dong - b.dong);
    const doi = (dsCau || []).map((c, i) => {
        if (c.batDau == null) return c;
        const v = lechCua(i, lech, lechSap);
        return {
            ...c,
            batDau: c.batDau + v,
            ketThuc: c.ketThuc == null ? c.ketThuc : c.ketThuc + v,
            ...(Array.isArray(c.tu) ? { tu: c.tu.map((x) => ({ ...x, batDau: x.batDau + v })) } : {}),
        };
    });
    return doi.map((c, i) => {
        const sau = doi[i + 1];
        if (c.ketThuc == null || sau?.batDau == null || c.ketThuc <= sau.batDau) return c;
        return { ...c, ketThuc: Math.max(c.batDau + 0.1, sau.batDau) };
    });
}

/**
 * Người học vừa bấm "khớp" lúc nghe một dòng bắt đầu: đó là dòng nào (thuần)? Dòng đang hiện hoặc
 * dòng kế tiếp — chọn dòng có mốc gần thời điểm bấm hơn (lời đang sớm thì dòng kế đã hiện sẵn,
 * lời đang muộn thì dòng kế chưa hiện).
 */
export function chonDongKhop(cauHieu, t, hien) {
    const ung = [hien, hien + 1].filter((i) => i >= 0 && cauHieu[i]?.batDau != null);
    if (!ung.length) return cauHieu[0]?.batDau != null ? 0 : -1;
    return ung.reduce((a, b) => (Math.abs(cauHieu[b].batDau - t) < Math.abs(cauHieu[a].batDau - t) ? b : a));
}

/** Đặt mốc chỉnh cho dòng `dong` (thuần): thay mốc cũ cùng dòng, giữ thứ tự tăng dần. */
export function datLechTu(lechTu, dong, lech) {
    const v = Math.round(lech * 100) / 100;
    return [...(lechTu || []).filter((m) => m.dong !== dong), { dong, lech: v }].sort((a, b) => a.dong - b.dong);
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
