/**
 * BÀI NGHE CÓ SCRIPT CHẠY THEO — admin thêm bài từ file âm thanh (VOA Learning English, phạm
 * vi công cộng), người học nghe với script tô sáng theo từng câu.
 *
 * Luồng thêm bài (admin): lấy âm thanh (link hoặc file tải lên) → lưu Cloudinary → Whisper chép
 * lời kèm mốc thời gian → chia thành câu. Mốc lấy từ CHÍNH file đã lưu nên luôn khớp, không phải
 * căn tay. Mỗi bài chỉ tốn Whisper một lần (khoảng 0,006 USD/phút), mọi người học dùng chung.
 *
 * Vì sao không tự cào trang VOA: trang bị chặn ở Việt Nam (admin cũng không mở được), và cấu
 * trúc trang có thể đổi bất cứ lúc nào. Admin chọn bài và đưa file — chắc chắn hơn.
 */
const BaiNghe = require('../models/BaiNghe');
const logger = require('../utils/logger');

/** Whisper nhận tối đa 25 MB mỗi file. */
const TOI_DA_BYTE = 25 * 1024 * 1024;
const GIA_WHISPER_PHUT = 0.006;
const CAP_DO = ['de', 'vua', 'kho'];
const LANG = ['en', 'zh'];

const cat = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const lamTron = (x) => Math.round(Number(x) * 100) / 100;

/**
 * Link âm thanh admin dán (thuần): chỉ http(s), không trỏ vào máy nội bộ. Admin là người tin
 * được, nhưng server không được thành công cụ đọc mạng nội bộ của chính nó.
 */
function kiemUrl(raw) {
    let u;
    try { u = new URL(String(raw || '').trim()); } catch { return null; }
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return null;
    if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || h === '[::1]') return null;
    return u.toString();
}

/** Tải âm thanh từ link, có giới hạn dung lượng và thời gian. */
async function taiAudio(url) {
    const r = await fetch(url, { signal: AbortSignal.timeout(60_000), redirect: 'follow' });
    if (!r.ok) throw Object.assign(new Error(`Không tải được âm thanh (HTTP ${r.status}).`), { ma: 400 });
    const loai = r.headers.get('content-type') || '';
    if (loai && !/audio|video|octet-stream/.test(loai)) {
        throw Object.assign(new Error('Link này không phải file âm thanh.'), { ma: 400 });
    }
    const dai = Number(r.headers.get('content-length') || 0);
    if (dai > TOI_DA_BYTE) throw Object.assign(new Error('File âm thanh lớn hơn 25 MB.'), { ma: 400 });
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > TOI_DA_BYTE) throw Object.assign(new Error('File âm thanh lớn hơn 25 MB.'), { ma: 400 });
    return buf;
}

/** Lưu lên Cloudinary (âm thanh nằm trong nhóm `video` của Cloudinary). */
function luuCloudinary(buffer) {
    const { cloudinary, isConfigured } = require('../utils/cloudinary');
    if (!isConfigured()) {
        return Promise.reject(Object.assign(new Error('Chưa cấu hình Cloudinary nên không lưu được âm thanh.'), { ma: 503 }));
    }
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder: 'bai-nghe', resource_type: 'video', unique_filename: true, overwrite: false },
            (err, kq) => (err ? reject(err) : resolve({ url: kq.secure_url, id: kq.public_id, thoiLuong: Number(kq.duration) || 0 })),
        );
        stream.end(buffer);
    });
}

/**
 * Nơi chạy Whisper (thuần, đọc env): Groq nếu có khoá (gói miễn phí, cùng mô hình Whisper, API
 * giống OpenAI), không thì OpenAI. Hai bên trả cùng định dạng `verbose_json` có mốc từng đoạn.
 */
function nhaChepLoi(env = process.env) {
    if (env.GROQ_API_KEY) {
        return { ten: 'groq', apiKey: env.GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1', model: 'whisper-large-v3-turbo' };
    }
    if (env.OPENAI_API_KEY) return { ten: 'openai', apiKey: env.OPENAI_API_KEY, model: 'whisper-1' };
    return null;
}

/** Whisper chép lời kèm mốc thời gian từng đoạn. */
async function chepLoi(buffer, lang = 'en', tenFile = 'audio.mp3') {
    const nha = nhaChepLoi();
    if (!nha) throw Object.assign(new Error('Chưa cấu hình dịch vụ chép lời (GROQ_API_KEY hoặc OPENAI_API_KEY).'), { ma: 503 });
    const { OpenAI, toFile } = require('openai');
    const openai = new OpenAI({ apiKey: nha.apiKey, ...(nha.baseURL ? { baseURL: nha.baseURL } : {}) });
    const kq = await openai.audio.transcriptions.create({
        file: await toFile(buffer, tenFile),
        model: nha.model,
        language: lang === 'zh' ? 'zh' : 'en',
        // Whisper hay trả tiếng Trung không dấu câu, đôi khi phồn thể: câu mồi giản thể có dấu
        // câu kéo nó về đúng kiểu đó.
        ...(lang === 'zh' ? { prompt: '以下是普通话的句子，使用简体中文，并加上标点符号。' } : {}),
        response_format: 'verbose_json',
        timestamp_granularities: ['segment'],
    });
    return { doan: kq.segments || [], thoiLuong: Number(kq.duration) || 0 };
}

const RE_HET_CAU = /([.!?。！？]+["'”’)]?)\s*/g;
const soTu = (s, lang) => (lang === 'zh' ? s.replace(/[^一-鿿]/g, '').length / 2 : s.split(/\s+/).filter(Boolean).length);

/**
 * Chia các đoạn Whisper thành từng câu (thuần). Một đoạn có thể chứa vài câu: tách theo dấu kết
 * câu và chia thời gian theo độ dài chữ. Mảnh quá ngắn ("Yes.", "OK.") gộp vào câu trước để
 * script không vụn. Câu rỗng bị bỏ.
 */
function tachCau(doan, lang = 'en') {
    const manh = [];
    // Tiếng Trung: Whisper hay dùng dấu Latin giữa hai chữ Hán ("你好,我") → đổi sang dấu Trung.
    const DAU_ZH = { ',': '，', '?': '？', '!': '！', ';': '；', ':': '：' };
    const sua = (s) => (lang === 'zh' ? s.replace(/(?<=[一-鿿])[,?!;:](?=[一-鿿]|$)/g, (x) => DAU_ZH[x]) : s);
    for (const d of Array.isArray(doan) ? doan : []) {
        const text = sua(cat(d?.text, 2000));
        const bd = Number(d?.start);
        const kt = Number(d?.end);
        if (!text || !Number.isFinite(bd) || !Number.isFinite(kt) || kt <= bd) continue;
        const cac = text.split(RE_HET_CAU).reduce((acc, x, i, a) => {
            // split với nhóm bắt: [chữ, dấu, chữ, dấu…] → ghép chữ với dấu theo sau.
            if (i % 2 === 0 && x.trim()) acc.push(x.trim() + (a[i + 1] ? a[i + 1].trim() : ''));
            return acc;
        }, []);
        const tong = cac.reduce((s, x) => s + x.length, 0) || 1;
        let moc = bd;
        for (const x of cac) {
            const dai = ((kt - bd) * x.length) / tong;
            manh.push({ batDau: lamTron(moc), ketThuc: lamTron(moc + dai), text: x });
            moc += dai;
        }
    }
    const cau = [];
    for (const m of manh) {
        const truoc = cau[cau.length - 1];
        // Gộp khi mảnh quá ngắn, hoặc câu trước chưa có dấu kết câu (Whisper cắt đoạn giữa câu).
        // Tiếng Trung thì không dựa vào dấu câu: Whisper hay bỏ dấu kết câu, gộp theo nó là dồn cả
        // bài vào một câu — mỗi đoạn Whisper cắt ra đã là một câu nói.
        // Có trần độ dài: file không có dấu câu thì không dồn cả bài vào một câu.
        const chuaHetCau = lang !== 'zh' && !/[.!?。！？]["'”’)]?$/.test(truoc?.text || '');
        const gop = truoc && truoc.text.length < 300 && (soTu(m.text, lang) < 3 || chuaHetCau);
        if (gop) {
            truoc.text = cat(`${truoc.text}${lang === 'zh' ? '' : ' '}${m.text}`, 600);
            truoc.ketThuc = m.ketThuc;
        } else {
            cau.push({ ...m, text: cat(m.text, 600) });
        }
    }
    return cau;
}

/**
 * Thêm một bài: `{ url }` hoặc `{ buffer, tenFile }`, kèm tiêu đề, cấp độ, link nguồn.
 * Trả `{ bai }` hoặc `{ loi, ma }`.
 */
async function themBai({ url, buffer, tenFile, tieuDe, capDo, lang, nguon, nguonUrl, adminId } = {}) {
    const td = cat(tieuDe, 160);
    if (!td) return { loi: 'Hãy nhập tiêu đề bài.', ma: 400 };
    const ngonNgu = LANG.includes(lang) ? lang : 'en';
    let du = buffer;
    try {
        if (!du) {
            const link = kiemUrl(url);
            if (!link) return { loi: 'Hãy tải file âm thanh lên hoặc dán link http(s) hợp lệ.', ma: 400 };
            du = await taiAudio(link);
        }
        if (!du?.length || du.length > TOI_DA_BYTE) return { loi: 'File âm thanh rỗng hoặc lớn hơn 25 MB.', ma: 400 };

        const [luu, chep] = await Promise.all([luuCloudinary(du), chepLoi(du, ngonNgu, tenFile || 'audio.mp3')]);
        const cau = tachCau(chep.doan, ngonNgu);
        if (!cau.length) return { loi: 'Không nhận ra lời nói trong file này.', ma: 400 };
        const thoiLuong = luu.thoiLuong || chep.thoiLuong;
        logger.info('Bài nghe: đã thêm', { tieuDe: td, giay: Math.round(thoiLuong), soCau: cau.length, uocTinhUsd: lamTron((thoiLuong / 60) * GIA_WHISPER_PHUT) });

        const bai = await BaiNghe.create({
            tieuDe: td,
            lang: ngonNgu,
            capDo: CAP_DO.includes(capDo) ? capDo : 'vua',
            nguon: cat(nguon, 120) || 'VOA Learning English',
            nguonUrl: kiemUrl(nguonUrl) || '',
            audioUrl: luu.url,
            cloudinaryId: luu.id,
            thoiLuong: lamTron(thoiLuong),
            cau,
            taoBoi: adminId || null,
        });
        return { bai: { id: String(bai._id), tieuDe: bai.tieuDe, soCau: cau.length, thoiLuong: bai.thoiLuong } };
    } catch (e) {
        logger.warn('Bài nghe: thêm thất bại', { message: e?.message });
        return { loi: e?.ma ? e.message : 'Không xử lý được file âm thanh này. Thử lại hoặc dùng file khác.', ma: e?.ma || 502 };
    }
}

const tomTat = (b) => ({
    id: String(b._id), tieuDe: b.tieuDe, lang: b.lang, capDo: b.capDo, nguon: b.nguon,
    thoiLuong: b.thoiLuong, soCau: b.soCau ?? (b.cau || []).length,
});

/** Thư viện cho người học: bài đang hiện, của ngôn ngữ đang học. Không gửi script cho danh sách. */
async function danhSach(lang = 'en') {
    const ds = await BaiNghe.aggregate([
        { $match: { an: false, lang: lang === 'zh' ? 'zh' : 'en' } },
        { $sort: { createdAt: -1 } },
        { $limit: 200 },
        { $project: { tieuDe: 1, lang: 1, capDo: 1, nguon: 1, thoiLuong: 1, soCau: { $size: '$cau' } } },
    ]);
    return ds.map(tomTat);
}

/** Một bài, kèm âm thanh và script. Bài đã ẩn thì người học không mở được. */
async function layBai(id) {
    const b = await BaiNghe.findOne({ _id: id, an: false }).lean();
    if (!b) return { loi: 'Không tìm thấy bài nghe.', ma: 404 };
    return { ...tomTat(b), nguonUrl: b.nguonUrl, audioUrl: b.audioUrl, cau: b.cau };
}

/** Danh sách cho admin, gồm cả bài đã ẩn. */
async function danhSachAdmin() {
    const ds = await BaiNghe.aggregate([
        { $sort: { createdAt: -1 } },
        { $limit: 500 },
        { $project: { tieuDe: 1, lang: 1, capDo: 1, nguon: 1, thoiLuong: 1, an: 1, createdAt: 1, soCau: { $size: '$cau' } } },
    ]);
    return ds.map((b) => ({ ...tomTat(b), an: b.an, taoLuc: b.createdAt }));
}

/** Ẩn / hiện, đổi tiêu đề hoặc cấp độ. */
async function capNhat(id, { an, tieuDe, capDo } = {}) {
    const doi = {};
    if (typeof an === 'boolean') doi.an = an;
    if (tieuDe !== undefined && cat(tieuDe, 160)) doi.tieuDe = cat(tieuDe, 160);
    if (CAP_DO.includes(capDo)) doi.capDo = capDo;
    if (!Object.keys(doi).length) return { loi: 'Không có gì để cập nhật.', ma: 400 };
    const r = await BaiNghe.updateOne({ _id: id }, { $set: doi });
    if (!r.matchedCount) return { loi: 'Không tìm thấy bài nghe.', ma: 404 };
    return { ok: true };
}

module.exports = {
    themBai, danhSach, layBai, danhSachAdmin, capNhat,
    kiemUrl, tachCau, taiAudio, luuCloudinary, chepLoi, nhaChepLoi, TOI_DA_BYTE,
};
