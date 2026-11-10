/**
 * BÀI NGHE CÓ SCRIPT CHẠY THEO — admin thêm bài từ file âm thanh (VOA Learning English, phạm
 * vi công cộng), người học nghe với script tô sáng theo từng câu.
 *
 * Luồng thêm bài (admin), file KHÔNG đi qua server Render (RAM 512 MB, video dễ làm sập):
 *   1. Trình duyệt admin tải file (MP3 hoặc MP4) thẳng lên Cloudinary bằng chữ ký server cấp;
 *      hoặc admin dán link và Cloudinary tự tải về.
 *   2. Server hỏi Cloudinary thông tin file (không tin số liệu client gửi), nhờ Cloudinary tách
 *      âm thanh thành MP3 64 kbps nhẹ, đưa qua Whisper lấy mốc từng câu.
 * Mốc lấy từ CHÍNH file đã lưu nên luôn khớp. Mỗi bài chỉ chép lời một lần, mọi người dùng chung.
 *
 * Giới hạn 40 MB: gói miễn phí của Cloudinary chỉ biến đổi (tách âm thanh) file dưới 40 MB.
 *
 * Vì sao không tự cào trang VOA: trang bị chặn ở Việt Nam (admin cũng không mở được), và cấu
 * trúc trang có thể đổi bất cứ lúc nào. Admin chọn bài và đưa file — chắc chắn hơn.
 */
const BaiNghe = require('../models/BaiNghe');
const logger = require('../utils/logger');

/** Whisper nhận tối đa 25 MB mỗi file (MP3 64 kbps ≈ 50 phút). */
const TOI_DA_BYTE = 25 * 1024 * 1024;
/** File gốc trên Cloudinary: gói miễn phí chỉ tách âm thanh được từ file dưới 40 MB. */
const TOI_DA_GOC = 40 * 1024 * 1024;
const THU_MUC = 'bai-nghe';
/**
 * Ngưỡng credit Cloudinary (% của gói tháng) — từ đây không nhận file mới. Credit dùng chung
 * cho lưu trữ, băng thông xem và xử lý: để dư 20% cho người học xem bài đã có và ảnh/âm
 * thanh đề TOEIC. Đổi được qua env khi lên gói lớn hơn.
 */
const NGUONG_CREDIT = Number(process.env.BAI_NGHE_NGUONG_CREDIT) || 80;
const CACHE_MUC_DUNG_MS = 10 * 60 * 1000;
/** Bản phát cho người học: video nén 640px (nhẹ hơn bản gốc nhiều lần), tạo một lần lúc thêm bài. */
const BAN_PHAT_VIDEO = { width: 640, crop: 'limit', quality: 'auto', format: 'mp4' };
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

function cloud() {
    const c = require('../utils/cloudinary');
    if (!c.isConfigured()) throw Object.assign(new Error('Chưa cấu hình Cloudinary nên không lưu được file.'), { ma: 503 });
    return c.cloudinary;
}

/**
 * Chữ ký cho trình duyệt admin tải thẳng lên Cloudinary, khoá vào thư mục bài nghe. Ký ở server
 * vì API secret không bao giờ được ra client.
 */
async function chuKyTaiLen(now = Date.now()) {
    await kiemHanMuc();
    const c = cloud();
    const timestamp = Math.floor(now / 1000);
    const signature = c.utils.api_sign_request({ folder: THU_MUC, timestamp }, c.config().api_secret);
    return { cloudName: c.config().cloud_name, apiKey: c.config().api_key, timestamp, signature, folder: THU_MUC, toiDaByte: TOI_DA_GOC };
}

/**
 * Thông tin file trên Cloudinary (thuần): link phát, thời lượng, có hình hay không. Cloudinary
 * xếp âm thanh vào nhóm `video` và đánh dấu `is_audio`; video có hình thì có chiều rộng.
 */
function docTaiNguyen(r) {
    return {
        id: r.public_id,
        url: r.secure_url,
        thoiLuong: Number(r.duration) || 0,
        byte: Number(r.bytes) || 0,
        coHinh: !r.is_audio && Number(r.width) > 0,
    };
}

/** Link MP3 nhẹ tách từ file gốc: đưa qua Whisper, và là bản phát của bài chỉ có âm thanh. */
const linkAmThanh = (id) => cloud().url(id, { resource_type: 'video', format: 'mp3', bit_rate: '64k', secure: true });

/**
 * Mức dùng credit của tài khoản Cloudinary (thuần phần đọc kết quả). Cache ngắn: Admin API
 * cũng có hạn mức gọi, và số liệu Cloudinary chỉ cập nhật vài lần mỗi ngày.
 */
let _mucDung = null;
function docMucDung(u) {
    const c = u?.credits || {};
    const phanTram = Number.isFinite(Number(c.used_percent)) ? Number(c.used_percent)
        : (Number(c.limit) > 0 ? (Number(c.usage) / Number(c.limit)) * 100 : null);
    return {
        phanTram: phanTram === null ? null : Math.round(phanTram * 10) / 10,
        daDung: Number(c.usage) || 0,
        hanMuc: Number(c.limit) || 0,
        luuTruByte: Number(u?.storage?.usage) || 0,
        bangThongByte: Number(u?.bandwidth?.usage) || 0,
        nguong: NGUONG_CREDIT,
    };
}
async function mucDung({ lamMoi = false, now = Date.now() } = {}) {
    if (!lamMoi && _mucDung && now - _mucDung.luc < CACHE_MUC_DUNG_MS) return _mucDung.kq;
    const kq = docMucDung(await cloud().api.usage());
    _mucDung = { luc: now, kq };
    return kq;
}
/** Chặn file mới khi gần hết hạn mức. Không đọc được số liệu thì vẫn cho (không chặn oan). */
async function kiemHanMuc() {
    let m;
    try { m = await mucDung(); } catch (e) {
        logger.warn('Bài nghe: không đọc được mức dùng Cloudinary', { message: e?.message });
        return;
    }
    if (m.phanTram !== null && m.phanTram >= NGUONG_CREDIT) {
        throw Object.assign(new Error(`Cloudinary đã dùng ${m.phanTram}% hạn mức tháng (ngưỡng ${NGUONG_CREDIT}%). Tạm dừng thêm bài để dành phần còn lại cho người học xem bài đã có; xoá bớt bài cũ hoặc chờ sang tháng.`), { ma: 429 });
    }
}

/** Tạo bản video nén để phát; lỗi thì dùng bản gốc (bài vẫn thêm được). */
async function taoBanPhat(luu) {
    if (!luu.coHinh) return linkAmThanh(luu.id);
    try {
        const r = await cloud().uploader.explicit(luu.id, { type: 'upload', resource_type: 'video', eager: [BAN_PHAT_VIDEO] });
        return r?.eager?.[0]?.secure_url || luu.url;
    } catch (e) {
        logger.warn('Bài nghe: không tạo được bản video nén, dùng bản gốc', { message: e?.message });
        return luu.url;
    }
}

/** Xoá hẳn file trên Cloudinary (kèm các bản đã tạo từ nó). Lỗi thì chỉ ghi log. */
async function xoaFile(id) {
    if (!id || !String(id).startsWith(`${THU_MUC}/`)) return;
    try {
        await cloud().uploader.destroy(id, { resource_type: 'video', invalidate: true });
    } catch (e) {
        logger.warn('Bài nghe: không xoá được file trên Cloudinary', { id, message: e?.message });
    }
}

/** File đã có trên Cloudinary (trình duyệt vừa tải lên), hoặc nhờ Cloudinary tải từ link. */
async function layTaiNguyen({ cloudinaryId, url }) {
    const c = cloud();
    if (cloudinaryId) {
        // Chỉ nhận file trong thư mục bài nghe: không cho trỏ vào ảnh/audio đề TOEIC.
        if (!String(cloudinaryId).startsWith(`${THU_MUC}/`)) throw Object.assign(new Error('File không hợp lệ.'), { ma: 400 });
        return docTaiNguyen(await c.api.resource(cloudinaryId, { resource_type: 'video' }));
    }
    const link = kiemUrl(url);
    if (!link) throw Object.assign(new Error('Hãy tải file lên hoặc dán link http(s) hợp lệ.'), { ma: 400 });
    // Cloudinary tự tải từ link: file lớn không đi qua RAM của server.
    return docTaiNguyen(await c.uploader.upload(link, { resource_type: 'video', folder: THU_MUC, unique_filename: true, overwrite: false }));
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
 * Thêm một bài: `{ cloudinaryId }` (trình duyệt đã tải lên) hoặc `{ url }`, kèm tiêu đề, cấp độ,
 * link nguồn. Trả `{ bai }` hoặc `{ loi, ma }`.
 */
async function themBai({ cloudinaryId, url, tieuDe, capDo, lang, nguon, nguonUrl, adminId } = {}) {
    const td = cat(tieuDe, 160);
    if (!td) return { loi: 'Hãy nhập tiêu đề bài.', ma: 400 };
    const ngonNgu = LANG.includes(lang) ? lang : 'en';
    if (!cloudinaryId && !url) return { loi: 'Hãy tải file lên hoặc dán link http(s) hợp lệ.', ma: 400 };
    let luu = null;
    // Thất bại sau khi file đã lên Cloudinary → xoá luôn, không để file rác chiếm chỗ.
    const huy = async (loi) => { if (luu?.id) await xoaFile(luu.id); return loi; };
    try {
        // Dán link: Cloudinary sẽ tải file mới về, nên kiểm hạn mức trước. File trình duyệt vừa
        // tải lên thì đã kiểm lúc cấp chữ ký.
        if (!cloudinaryId) await kiemHanMuc();
        luu = await layTaiNguyen({ cloudinaryId, url });
        if (luu.byte > TOI_DA_GOC) return huy({ loi: 'File lớn hơn 40 MB: gói Cloudinary hiện tại không tách được âm thanh. Hãy dùng file nhỏ hơn.', ma: 400 });
        const chep = await chepLoi(await taiAudio(linkAmThanh(luu.id)), ngonNgu, 'audio.mp3');
        const cau = tachCau(chep.doan, ngonNgu);
        if (!cau.length) return huy({ loi: 'Không nhận ra lời nói trong file này.', ma: 400 });
        const mediaUrl = await taoBanPhat(luu);
        const thoiLuong = luu.thoiLuong || chep.thoiLuong;
        logger.info('Bài nghe: đã thêm', { tieuDe: td, giay: Math.round(thoiLuong), soCau: cau.length, uocTinhUsd: lamTron((thoiLuong / 60) * GIA_WHISPER_PHUT) });

        const bai = await BaiNghe.create({
            tieuDe: td,
            lang: ngonNgu,
            capDo: CAP_DO.includes(capDo) ? capDo : 'vua',
            nguon: cat(nguon, 120) || 'VOA Learning English',
            nguonUrl: kiemUrl(nguonUrl) || '',
            mediaUrl,
            coHinh: luu.coHinh,
            cloudinaryId: luu.id,
            byte: luu.byte,
            thoiLuong: lamTron(thoiLuong),
            cau,
            taoBoi: adminId || null,
        });
        return { bai: { id: String(bai._id), tieuDe: bai.tieuDe, soCau: cau.length, thoiLuong: bai.thoiLuong, coHinh: luu.coHinh } };
    } catch (e) {
        logger.warn('Bài nghe: thêm thất bại', { message: e?.message });
        return huy({ loi: e?.ma ? e.message : 'Không xử lý được file này. Thử lại hoặc dùng file khác.', ma: e?.ma || 502 });
    }
}

/** Xoá hẳn một bài: file trên Cloudinary và bản ghi. Không lấy lại được. */
async function xoaBai(id) {
    const b = await BaiNghe.findById(id).select('cloudinaryId').lean();
    if (!b) return { loi: 'Không tìm thấy bài nghe.', ma: 404 };
    await xoaFile(b.cloudinaryId);
    await BaiNghe.deleteOne({ _id: id });
    return { ok: true };
}

/** Tổng quan cho admin: mức dùng Cloudinary và dung lượng thư viện bài nghe. */
async function tongQuanDungLuong() {
    const [m, tong] = await Promise.all([
        mucDung().catch((e) => ({ loi: e?.message || 'Không đọc được mức dùng Cloudinary.' })),
        BaiNghe.aggregate([{ $group: { _id: null, soBai: { $sum: 1 }, byte: { $sum: '$byte' }, soVideo: { $sum: { $cond: ['$coHinh', 1, 0] } } } }]),
    ]);
    const t = tong[0] || { soBai: 0, byte: 0, soVideo: 0 };
    return { cloudinary: m, baiNghe: { soBai: t.soBai, soVideo: t.soVideo, byte: t.byte } };
}

const tomTat = (b) => ({
    id: String(b._id), tieuDe: b.tieuDe, lang: b.lang, capDo: b.capDo, nguon: b.nguon,
    thoiLuong: b.thoiLuong, soCau: b.soCau ?? (b.cau || []).length, coHinh: !!b.coHinh,
});

/** Thư viện cho người học: bài đang hiện, của ngôn ngữ đang học. Không gửi script cho danh sách. */
async function danhSach(lang = 'en') {
    const ds = await BaiNghe.aggregate([
        { $match: { an: false, lang: lang === 'zh' ? 'zh' : 'en' } },
        { $sort: { createdAt: -1 } },
        { $limit: 200 },
        { $project: { tieuDe: 1, lang: 1, capDo: 1, nguon: 1, thoiLuong: 1, coHinh: 1, soCau: { $size: '$cau' } } },
    ]);
    return ds.map(tomTat);
}

/** Một bài, kèm âm thanh và script. Bài đã ẩn thì người học không mở được. */
async function layBai(id) {
    const b = await BaiNghe.findOne({ _id: id, an: false }).lean();
    if (!b) return { loi: 'Không tìm thấy bài nghe.', ma: 404 };
    return { ...tomTat(b), nguonUrl: b.nguonUrl, mediaUrl: b.mediaUrl, cau: b.cau };
}

/** Danh sách cho admin, gồm cả bài đã ẩn. */
async function danhSachAdmin() {
    const ds = await BaiNghe.aggregate([
        { $sort: { createdAt: -1 } },
        { $limit: 500 },
        { $project: { tieuDe: 1, lang: 1, capDo: 1, nguon: 1, thoiLuong: 1, coHinh: 1, an: 1, byte: 1, createdAt: 1, soCau: { $size: '$cau' } } },
    ]);
    return ds.map((b) => ({ ...tomTat(b), an: b.an, byte: b.byte || 0, taoLuc: b.createdAt }));
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
    themBai, danhSach, layBai, danhSachAdmin, capNhat, chuKyTaiLen, xoaBai, tongQuanDungLuong, mucDung, docMucDung,
    _xoaCacheMucDung: () => { _mucDung = null; },
    kiemUrl, tachCau, taiAudio, chepLoi, nhaChepLoi, docTaiNguyen, TOI_DA_BYTE, TOI_DA_GOC,
};
