/**
 * Dịch máy dùng chung: Google (đường miễn phí `client=gtx`) trước, bị chặn thì MyMemory.
 *
 * Vì sao cần đường dự phòng: `gtx` không phải API chính thức, Google giới hạn theo IP. Gọi nhiều
 * (tra từ, dịch câu, phiên âm…) là bị chuyển hướng sang trang "sorry" — trình duyệt chỉ thấy lỗi
 * CORS, popup Dịch nhanh báo "Không kết nối được dịch vụ dịch" (đã xảy ra thật trên bản chạy thật,
 * máy dev bị cùng lúc). MyMemory miễn phí, cho gọi thẳng từ trình duyệt (CORS *), tự nhận ngôn ngữ
 * nguồn; mỗi người gọi từ IP của mình nên không dồn hạn mức vào một chỗ.
 *
 * Google bị chặn một lần thì bỏ qua Google trong `NGHI_GOOGLE_MS`: khỏi bắt người dùng chờ một lời
 * gọi chắc chắn hỏng ở mỗi lần tra.
 */

const GOOGLE = 'https://translate.googleapis.com/translate_a/single';
const MYMEMORY = 'https://api.mymemory.translated.net/get';
/** MyMemory nhận tối đa khoảng 500 ký tự mỗi lần. */
const TOI_DA_KY_TU = 500;
export const NGHI_GOOGLE_MS = 10 * 60 * 1000;

let googleNghiDen = 0;
/** Cho test: quên trạng thái Google bị chặn. */
export function _datLaiDichMay() { googleNghiDen = 0; }

function henGio(ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    return { signal: ctrl.signal, xong: () => clearTimeout(t) };
}

/** Gọi Google, trả JSON thô (mảng của gtx). `dt`: các phần cần lấy ('t' bản dịch, 'bd' từ điển, 'rm' phiên âm). */
export async function goiGoogle(q, { sl = 'auto', tl = 'vi', dt = ['t'], timeout = 6000 } = {}) {
    const hg = henGio(timeout);
    try {
        const url = `${GOOGLE}?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}${dt.map((d) => `&dt=${d}`).join('')}&q=${encodeURIComponent(q)}`;
        const res = await fetch(url, { signal: hg.signal });
        if (!res.ok) throw new Error(`Google ${res.status}`);
        return await res.json();
    } finally {
        hg.xong();
    }
}

/** Gỡ thực thể HTML MyMemory hay để lại trong bản dịch (&#39; &quot; &amp;…). */
const goThucThe = (s) => String(s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** Gọi MyMemory → `{ translated, sourceLang }`. Hết hạn mức hay lỗi thì ném lỗi. */
export async function goiMyMemory(q, { sl = 'auto', tl = 'vi', timeout = 8000 } = {}) {
    const hg = henGio(timeout);
    try {
        const cap = `${sl === 'auto' ? 'autodetect' : sl}|${tl}`;
        const res = await fetch(`${MYMEMORY}?q=${encodeURIComponent(q.slice(0, TOI_DA_KY_TU))}&langpair=${encodeURIComponent(cap)}`, { signal: hg.signal });
        if (!res.ok) throw new Error(`MyMemory ${res.status}`);
        const j = await res.json();
        // Câu đã là ngôn ngữ đích (gõ tiếng Anh mà "Dịch sang: English"): MyMemory từ chối. Báo lại
        // như Google — nguồn = đích — để popup tự đổi đích như khi dịch bằng Google; nơi khác thì
        // "bản dịch" chính là câu gốc.
        if (/TWO DISTINCT LANGUAGES/i.test(`${j?.responseDetails} ${j?.responseData?.translatedText}`)) {
            return { translated: q, sourceLang: tl, cungNgonNgu: true };
        }
        const ban = goThucThe(j?.responseData?.translatedText).trim();
        if (Number(j?.responseStatus) !== 200 || j?.quotaFinished || !ban || /^MYMEMORY WARNING/i.test(ban)) {
            throw new Error('MyMemory không dịch được');
        }
        return { translated: ban, sourceLang: j?.responseData?.detectedLanguage || (sl === 'auto' ? '' : sl) };
    } finally {
        hg.xong();
    }
}

/** Google có đang bị bỏ qua không (vừa bị chặn). */
export const googleDangNghi = (now = Date.now()) => now < googleNghiDen;

/**
 * Dịch: Google → MyMemory. Trả `{ translated, sourceLang, nguon, google? }`; `google` là JSON thô
 * của Google (khi dịch được bằng Google) để nơi cần phiên âm/từ điển đọc thêm.
 */
export async function dichMay(text, { sl = 'auto', tl = 'vi', dt = ['t'], timeout } = {}) {
    const q = String(text || '').trim();
    if (!q) return { translated: '', sourceLang: sl, nguon: '' };
    if (!googleDangNghi()) {
        try {
            const g = await goiGoogle(q, { sl, tl, dt, timeout });
            const translated = (g?.[0] || []).map((seg) => seg?.[0]).filter(Boolean).join('').trim();
            if (translated) return { translated, sourceLang: g?.[2] || sl, nguon: 'google', google: g };
        } catch {
            googleNghiDen = Date.now() + NGHI_GOOGLE_MS;
        }
    }
    const m = await goiMyMemory(q, { sl, tl, timeout });
    return { ...m, nguon: 'mymemory' };
}
