/**
 * Chọn ĐÚNG giọng người dùng đã chọn trong Cài đặt từ giọng có sẵn của TRÌNH DUYỆT —
 * dùng khi máy chủ đọc (`/api/tts`, Edge TTS) lỗi.
 *
 * Trước đây đường dự phòng chỉ đặt `lang` nên trình duyệt luôn lấy MỘT giọng mặc
 * định: chọn Guy, Sonia hay 云希 ở Cài đặt cũng chỉ nghe một người đọc. Trình duyệt
 * Edge có sẵn CHÍNH các giọng "Microsoft … Online (Natural)" mà máy chủ dùng, nên
 * tìm theo tên là ra đúng giọng. Trình duyệt khác (Chrome…) không có thì lấy một
 * giọng cùng ngôn ngữ.
 *
 * Bảng khớp `VOICE_MAP` ở backend/routes/tts.js (test kiểm). Tên lấy đúng như Edge
 * hiển thị: giọng Việt CÓ DẤU, giọng Trung bằng chữ Hán, Seraphina bằng tiếng Đức.
 */
const GIONG = {
    'en-us-f': ['en-US', 'Aria'],
    'en-gb-f': ['en-GB', 'Sonia'],
    'en-au-f': ['en-AU', 'Natasha'],
    'en-ca-f': ['en-CA', 'Clara'],
    'en-us-m': ['en-US', 'Guy'],
    'en-gb-m': ['en-GB', 'Ryan'],
    'en-au-m': ['en-AU', 'William'],
    'en-ca-m': ['en-CA', 'Liam'],
    'en-us': ['en-US', 'Aria'],
    'en-gb': ['en-GB', 'Sonia'],
    'en-au': ['en-AU', 'Natasha'],
    'en-ca': ['en-CA', 'Clara'],
    'zh-cn-xiaoxiao': ['zh-CN', '晓晓'],
    'zh-cn-xiaoyi': ['zh-CN', '晓伊'],
    'zh-tw': ['zh-TW', '曉臻'],
    'zh-cn-yunxi': ['zh-CN', '云希'],
    'zh-cn-yunyang': ['zh-CN', '云扬'],
    'zh-tw-m': ['zh-TW', '雲哲'],
    'vi-vn-f': ['vi-VN', 'Hoài My'],
    'vi-vn-m': ['vi-VN', 'Nam Minh'],
    'vi-vn': ['vi-VN', 'Hoài My'],
    'vi-multi-emma': ['en-US', 'Emma Multilingual'],
    'vi-multi-seraphina': ['de-DE', 'Seraphina Mehrsprachig'],
    'vi-multi-andrew': ['en-US', 'Andrew Multilingual'],
    'vi-multi-brian': ['en-US', 'Brian Multilingual'],
};

/** Mã "ngẫu nhiên" → các mã trong đó (khớp các danh sách `chonGiong` ở server). */
const NGAU_NHIEN = {
    'en-random': ['en-us-f', 'en-us-m', 'en-gb-f', 'en-gb-m', 'en-au-f', 'en-au-m', 'en-ca-f'],
    'zh-cn-random': ['zh-cn-xiaoxiao', 'zh-cn-xiaoyi', 'zh-cn-yunxi', 'zh-cn-yunyang'],
    'vi-random': ['vi-vn-f', 'vi-vn-m'],
};

/** Băm chuỗi ổn định: cùng một từ luôn rơi vào cùng một giọng (như server). */
function bam(text) {
    let h = 5381;
    for (const c of String(text)) h = ((h * 33) ^ c.codePointAt(0)) >>> 0;
    return h;
}

function danhSachGiong() {
    try { return window.speechSynthesis?.getVoices?.() || []; } catch { return []; }
}

/** Mã giọng cụ thể sau khi đã bốc trong mã "ngẫu nhiên". */
export function maCuThe(ma, text) {
    const ds = NGAU_NHIEN[ma];
    return ds ? ds[bam(text) % ds.length] : ma;
}

/**
 * Giọng trình duyệt ĐÚNG với mã giọng của app (đã chọn trong Cài đặt), hoặc null
 * nếu trình duyệt không có giọng đó.
 */
export function giongTheoMa(ma, text = '') {
    const cap = GIONG[maCuThe(ma, text)];
    if (!cap) return null;
    const [locale, ten] = cap;
    const khop = danhSachGiong().filter((v) => v.lang === locale && v.name.includes(`Microsoft ${ten} `));
    // Ưu tiên tên KHỚP ĐÚNG ("Microsoft William Online…"): "Microsoft William " cũng
    // khớp "William Multilingual" — một giọng khác hẳn.
    return khop.find((v) => v.name.includes(`Microsoft ${ten} Online`)) || khop[0] || null;
}

/**
 * Một giọng bất kỳ CÙNG ngôn ngữ (vd 'zh-CN'), ưu tiên giọng tự nhiên (Natural /
 * Google). Dùng khi trình duyệt không có đúng giọng đã chọn.
 */
export function giongCungNgonNgu(lang) {
    const goc = String(lang || '').split('-')[0].toLowerCase();
    const cung = danhSachGiong().filter((v) => v.lang.toLowerCase().startsWith(goc));
    return cung.find((v) => /Natural|Google/i.test(v.name)) || cung[0] || null;
}

export const _GIONG = GIONG;
export const _NGAU_NHIEN = NGAU_NHIEN;
