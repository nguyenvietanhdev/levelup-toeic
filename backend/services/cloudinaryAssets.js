/**
 * Đối chiếu tài sản (ảnh/audio TOEIC) giữa DB — Cloudinary — đĩa local.
 *
 * Ba nguồn sự thật phải khớp nhau:
 *   • DB (ToeicQuestionSet.imageUrls[] / .audioUrl) — nơi quyết định file nào ĐANG DÙNG
 *   • Cloudinary — kho chính khi đã cấu hình env
 *   • public/assets/ — kho cũ, còn sót lại từ thời chưa có cloud
 *
 * Tách riêng khỏi route để test được phần thuần (đọc URL, dựng đường dẫn) mà
 * không cần tài khoản Cloudinary lẫn DB.
 */
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

/** URL đã nằm trên cloud (http/https) hay còn là đường đĩa (/assets/...). */
function isCloudUrl(url) {
    return /^https?:\/\//i.test(String(url || ''));
}

/**
 * secure_url → public_id.
 *   https://res.cloudinary.com/dx/image/upload/v1712/toeic/images/ets26t1/a.png
 *   → toeic/images/ets26t1/a
 *
 * Cắt cả đoạn biến đổi ảnh (w_300,h_200/...) nếu có: URL trong DB là secure_url
 * thuần, nhưng URL người khác dán tay vào thì chưa chắc.
 */
function publicIdFromUrl(url) {
    const s = String(url || '').split('?')[0];
    if (!/res\.cloudinary\.com/i.test(s)) return null;

    const after = s.split('/upload/')[1];
    if (!after) return null;

    const parts = after.split('/');
    // Bỏ đoạn transform (có dấu _ kiểu w_300) và version (v1712345678) ở đầu.
    while (parts.length > 1 && /^(v\d+|[a-z]+_[^/]+)$/i.test(parts[0])) parts.shift();

    const joined = parts.join('/');
    if (!joined) return null;
    return joined.replace(/\.[a-z0-9]+$/i, ''); // bỏ đuôi file
}

/**
 * URL đĩa → thông tin để đẩy lên cloud.
 * `/assets/images/ets26t1/a.png` → public/assets/images/ets26t1/a.png,
 * lên cloud vào folder `toeic/images/ets26t1`.
 */
function localTarget(url, kind /* 'images' | 'audio' */) {
    if (!url || isCloudUrl(url)) return null;
    const rel = String(url).replace(/^\//, '');
    const abs = path.join(PUBLIC_DIR, rel);

    // Chặn ../ leo ra ngoài public/ — URL trong DB là dữ liệu, không phải hằng số.
    if (!abs.startsWith(PUBLIC_DIR)) return null;

    const parts = rel.split('/');
    const folder = parts[2] || 'other';   // assets/<kind>/<folder>/file
    return {
        url,
        abs,
        cloudFolder: `toeic/${kind}/${folder}`,
        publicId: path.parse(abs).name,
        resourceType: kind === 'audio' ? 'video' : 'image',
    };
}

/** Kích thước file, 0 nếu không tồn tại (file đã bị xoá nhưng DB còn trỏ). */
function fileSize(abs) {
    try { return fs.statSync(abs).size; } catch (_) { return 0; }
}

/**
 * Duyệt mọi màn hỏi, trả về từng tham chiếu ảnh/audio kèm vị trí để ghi ngược.
 * Giữ ở dạng mảng phẳng vì cả kiểm kê, migration lẫn dò mồ côi đều cần nó.
 */
async function listAssetRefs() {
    const ToeicQuestionSet = require('../models/ToeicQuestionSet');
    const sets = await ToeicQuestionSet.find({})
        .select('source imageUrls audioUrl').lean();

    const refs = [];
    for (const set of sets) {
        (set.imageUrls || []).forEach((url, index) => {
            if (!url) return;
            refs.push({ setId: String(set._id), source: set.source || '—', kind: 'images', field: 'imageUrls', index, url });
        });
        if (set.audioUrl) {
            refs.push({ setId: String(set._id), source: set.source || '—', kind: 'audio', field: 'audioUrl', index: null, url: set.audioUrl });
        }
    }
    return refs;
}

/**
 * Mọi public_id Cloudinary đang được DB tham chiếu — dùng để dò file mồ côi.
 *
 * CỐ TÌNH không phân biệt image/video: trên kho thật có những public_id tồn tại
 * ở CẢ HAI dạng, nên so theo id trần sẽ coi cả hai là "đang dùng". Nhầm theo
 * hướng này chỉ khiến vài file rác sống sót; phân biệt theo loại thì rủi ro
 * ngược lại là xoá nhầm ảnh đề thật — đắt hơn nhiều.
 */
async function dbPublicIds() {
    const refs = await listAssetRefs();
    const ids = new Set();
    for (const r of refs) {
        const id = publicIdFromUrl(r.url);
        if (id) ids.add(id);
    }
    return ids;
}

/**
 * Kiểm kê: bao nhiêu tham chiếu đã lên cloud, bao nhiêu còn nằm đĩa, bao nhiêu
 * mất file. Kèm danh sách mã đề còn nợ để biết nên đẩy đề nào trước.
 */
async function inventory() {
    const refs = await listAssetRefs();
    const stat = () => ({ cloud: 0, local: 0, missing: 0, localBytes: 0 });
    const out = { images: stat(), audio: stat() };
    const bySource = new Map();

    for (const r of refs) {
        const bucket = out[r.kind];
        if (isCloudUrl(r.url)) { bucket.cloud++; continue; }

        const t = localTarget(r.url, r.kind);
        const size = t ? fileSize(t.abs) : 0;
        if (!t || !size) {
            bucket.missing++;
        } else {
            bucket.local++;
            bucket.localBytes += size;
        }

        const row = bySource.get(r.source) || { source: r.source, images: 0, audio: 0, missing: 0, bytes: 0 };
        if (!t || !size) row.missing++;
        else { row[r.kind]++; row.bytes += size; }
        bySource.set(r.source, row);
    }

    return {
        totalRefs: refs.length,
        images: out.images,
        audio: out.audio,
        pending: out.images.local + out.audio.local,
        bySource: [...bySource.values()]
            .sort((a, b) => (b.images + b.audio + b.missing) - (a.images + a.audio + a.missing)),
    };
}

/**
 * Đẩy MỘT LÔ tài sản còn nằm đĩa lên Cloudinary rồi viết lại URL trong DB.
 *
 * Cố tình làm theo lô nhỏ thay vì chạy hết một phát: kho ảnh cỡ vài trăm MB sẽ
 * treo request cho tới lúc timeout, còn đẩy từng lô thì admin thấy tiến độ và
 * dừng lại lúc nào cũng được — đã đẩy tới đâu, DB ghi tới đó.
 *
 * @param {object} opts  limit: số file mỗi lô · apply: false = chỉ xem trước
 */
async function migrateBatch({ limit = 20, apply = false } = {}) {
    const cloud = require('../utils/cloudinary');
    const ToeicQuestionSet = require('../models/ToeicQuestionSet');
    if (!cloud.isConfigured()) {
        const e = new Error('Chưa cấu hình Cloudinary (thiếu CLOUDINARY_CLOUD_NAME / _API_KEY / _API_SECRET)');
        e.statusCode = 400;
        throw e;
    }

    const refs = await listAssetRefs();
    const local = refs.filter(r => !isCloudUrl(r.url));

    const picked = [];
    const missing = [];
    for (const r of local) {
        const t = localTarget(r.url, r.kind);
        if (!t || !fileSize(t.abs)) { missing.push({ ...r, reason: 'không thấy file trên đĩa' }); continue; }
        if (picked.length < limit) picked.push({ ...r, target: t });
    }

    const uploaded = [];
    const failed = [];

    if (apply) {
        for (const item of picked) {
            try {
                const url = await cloud.uploadFile(item.target.abs, item.target);
                // Ghi từng file một: đứt mạng giữa chừng thì phần đã đẩy vẫn được
                // lưu, chạy lô sau không phải upload lại từ đầu.
                if (item.field === 'audioUrl') {
                    await ToeicQuestionSet.updateOne({ _id: item.setId }, { $set: { audioUrl: url } });
                } else {
                    await ToeicQuestionSet.updateOne(
                        { _id: item.setId },
                        { $set: { [`imageUrls.${item.index}`]: url } },
                    );
                }
                uploaded.push({ source: item.source, from: item.url, to: url });
            } catch (err) {
                failed.push({ source: item.source, url: item.url, error: err.message });
            }
        }
    }

    return {
        apply,
        batch: picked.length,
        uploaded: apply ? uploaded.length : 0,
        details: apply ? uploaded : picked.map(p => ({ source: p.source, from: p.url, to: `${p.target.cloudFolder}/…` })),
        failed,
        missing: missing.slice(0, 50),
        missingCount: missing.length,
        // Còn lại SAU lô này — để UI biết bấm tiếp bao nhiêu lần nữa.
        remaining: Math.max(0, local.length - missing.length - (apply ? uploaded.length : 0)),
    };
}

module.exports = {
    isCloudUrl, publicIdFromUrl, localTarget,
    listAssetRefs, dbPublicIds, inventory, migrateBatch,
    PUBLIC_DIR,
};
