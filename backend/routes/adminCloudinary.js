/**
 * Quản lý Cloudinary cho admin: trạng thái/hạn mức, kiểm kê ảnh–audio, đẩy dần
 * kho đĩa cũ lên cloud, duyệt & xoá file, dọn file mồ côi.
 *
 * Mọi route đều đòi quyền admin. Riêng phần XOÁ mặc định TỪ CHỐI file đang được
 * DB tham chiếu — muốn xoá thật phải gửi force, để một cú bấm nhầm không làm
 * thủng đề thi đang chạy.
 */
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { cloudinary, isConfigured } = require('../utils/cloudinary');
const assets = require('../services/cloudinaryAssets');
const logger = require('../utils/logger');

const admin = [protect, authorize('admin')];

/** Chặn sớm khi chưa có env, kèm lời nhắn cụ thể thay vì để SDK ném lỗi khó hiểu. */
function requireCloud(req, res, next) {
    if (!isConfigured()) {
        return res.status(400).json({
            success: false,
            message: 'Chưa cấu hình Cloudinary — đặt CLOUDINARY_CLOUD_NAME / _API_KEY / _API_SECRET rồi khởi động lại server',
        });
    }
    next();
}

const fail = (res, err, code = 500) => {
    logger.error('Cloudinary admin lỗi', { error: err.message });
    res.status(err.statusCode || code).json({ success: false, message: err.message });
};

// ── Trạng thái + hạn mức ────────────────────────────────────────────────────
router.get('/status', admin, async (req, res) => {
    const configured = isConfigured();
    const base = { configured, cloudName: process.env.CLOUDINARY_CLOUD_NAME || null };
    if (!configured) return res.json({ success: true, data: { ...base, usage: null } });

    try {
        // api.usage() trả hạn mức của cả tài khoản (credits/storage/bandwidth).
        const u = await cloudinary.api.usage();
        res.json({
            success: true,
            data: {
                ...base,
                usage: {
                    plan: u.plan,
                    lastUpdated: u.last_updated,
                    credits: u.credits || null,
                    storageBytes: u.storage?.usage ?? null,
                    bandwidthBytes: u.bandwidth?.usage ?? null,
                    transformations: u.transformations?.usage ?? null,
                    resources: u.resources ?? null,
                    derivedResources: u.derived_resources ?? null,
                },
            },
        });
    } catch (err) {
        // Sai key / hết hạn mức API: vẫn trả 200 kèm lý do để tab hiện được phần
        // kiểm kê DB (không phụ thuộc cloud) thay vì trắng cả trang.
        res.json({ success: true, data: { ...base, usage: null, usageError: err.message } });
    }
});

// ── Kiểm kê tài sản trong DB (không cần cloud) ──────────────────────────────
router.get('/inventory', admin, async (req, res) => {
    try {
        res.json({ success: true, data: await assets.inventory() });
    } catch (err) { fail(res, err); }
});

// ── Đẩy một lô file đĩa lên cloud ───────────────────────────────────────────
router.post('/migrate', admin, requireCloud, async (req, res) => {
    try {
        const limit = Math.min(100, Math.max(1, parseInt(req.body.limit, 10) || 20));
        const apply = req.body.apply === true;
        const result = await assets.migrateBatch({ limit, apply });
        if (apply) {
            logger.info('Đẩy tài sản lên Cloudinary', {
                uploaded: result.uploaded, failed: result.failed.length, by: String(req.user.id),
            });
        }
        res.json({
            success: true,
            message: apply
                ? `Đã đẩy ${result.uploaded}/${result.batch} file lên Cloudinary, còn lại ${result.remaining}`
                : `Xem trước: ${result.batch} file sẽ được đẩy (còn tổng cộng ${result.remaining})`,
            data: result,
        });
    } catch (err) { fail(res, err, 400); }
});

// ── Cây thư mục trên Cloudinary ─────────────────────────────────────────────
router.get('/folders', admin, requireCloud, async (req, res) => {
    try {
        const prefix = String(req.query.prefix || '').trim();
        const r = prefix
            ? await cloudinary.api.sub_folders(prefix)
            : await cloudinary.api.root_folders();
        res.json({ success: true, data: (r.folders || []).map(f => ({ name: f.name, path: f.path })) });
    } catch (err) { fail(res, err); }
});

// ── Duyệt file theo folder ──────────────────────────────────────────────────
router.get('/resources', admin, requireCloud, async (req, res) => {
    try {
        const resourceType = req.query.resourceType === 'video' ? 'video' : 'image';
        const prefix = String(req.query.prefix || '').trim();
        const max = Math.min(100, Math.max(1, parseInt(req.query.max, 10) || 30));

        const r = await cloudinary.api.resources({
            type: 'upload',
            resource_type: resourceType,
            prefix: prefix || undefined,
            max_results: max,
            next_cursor: req.query.cursor || undefined,
        });

        // Đánh dấu file nào đang được DB dùng — admin cần biết trước khi bấm xoá.
        const used = await assets.dbPublicIds();
        res.json({
            success: true,
            data: {
                items: (r.resources || []).map(x => ({
                    publicId: x.public_id,
                    url: x.secure_url,
                    format: x.format,
                    bytes: x.bytes,
                    width: x.width,
                    height: x.height,
                    createdAt: x.created_at,
                    resourceType: x.resource_type,
                    inUse: used.has(x.public_id),
                })),
                nextCursor: r.next_cursor || null,
            },
        });
    } catch (err) { fail(res, err); }
});

// Quét hết một resource_type để dò mồ côi. Chặn trần để một cú bấm không kéo về
// hàng chục nghìn bản ghi (và ăn hết hạn mức Admin API).
const ORPHAN_SCAN_CAP = 2000;

// ── File có trên cloud nhưng DB không dùng ──────────────────────────────────
router.get('/orphans', admin, requireCloud, async (req, res) => {
    try {
        // Bỏ trống = quét cả kho. Ảnh cũ nằm ở folder phẳng theo mã đề (ets26t1/…),
        // ảnh mới nằm dưới toeic/… — ép prefix mặc định là bỏ sót một trong hai.
        const resourceType = req.query.resourceType === 'video' ? 'video' : 'image';
        const prefix = String(req.query.prefix || '').trim();

        const used = await assets.dbPublicIds();
        const orphans = [];
        let scanned = 0;
        let cursor;
        let truncated = false;

        do {
            const r = await cloudinary.api.resources({
                type: 'upload',
                resource_type: resourceType,
                prefix: prefix || undefined,
                max_results: 500,
                next_cursor: cursor,
            });
            for (const x of r.resources || []) {
                scanned++;
                if (!used.has(x.public_id)) {
                    orphans.push({
                        publicId: x.public_id,
                        url: x.secure_url,
                        bytes: x.bytes,
                        format: x.format,
                        createdAt: x.created_at,
                        resourceType: x.resource_type,
                    });
                }
            }
            cursor = r.next_cursor;
            if (scanned >= ORPHAN_SCAN_CAP) { truncated = !!cursor; break; }
        } while (cursor);

        res.json({
            success: true,
            data: {
                scanned,
                truncated,
                referencedInDb: used.size,
                totalBytes: orphans.reduce((s, o) => s + (o.bytes || 0), 0),
                items: orphans,
            },
        });
    } catch (err) { fail(res, err); }
});

// ── Xoá file trên cloud ─────────────────────────────────────────────────────
router.post('/delete', admin, requireCloud, async (req, res) => {
    try {
        const publicIds = (Array.isArray(req.body.publicIds) ? req.body.publicIds : [])
            .map(String).filter(Boolean);
        const resourceType = req.body.resourceType === 'video' ? 'video' : 'image';
        const force = req.body.force === true;

        if (!publicIds.length) {
            return res.status(400).json({ success: false, message: 'Chưa chọn file nào để xoá' });
        }
        if (publicIds.length > 200) {
            return res.status(400).json({ success: false, message: 'Mỗi lần xoá tối đa 200 file' });
        }

        // Kiểm tra lại ngay lúc xoá, không tin danh sách client gửi lên: giữa lúc
        // admin mở tab và lúc bấm xoá, đề có thể vừa được gán ảnh đó.
        const used = await assets.dbPublicIds();
        const blocked = publicIds.filter(id => used.has(id));
        const targets = force ? publicIds : publicIds.filter(id => !used.has(id));

        if (!targets.length) {
            return res.status(409).json({
                success: false,
                message: `${blocked.length} file đang được đề thi dùng — không xoá. Vẫn muốn xoá thì bấm lại và xác nhận lần hai.`,
                data: { blocked },
            });
        }

        const result = await cloudinary.api.delete_resources(targets, { resource_type: resourceType });
        const deleted = Object.entries(result.deleted || {})
            .filter(([, v]) => v === 'deleted').map(([k]) => k);

        logger.info('Xoá file Cloudinary', {
            count: deleted.length, force, resourceType, by: String(req.user.id),
        });

        res.json({
            success: true,
            message: `Đã xoá ${deleted.length} file${blocked.length && !force ? `, bỏ qua ${blocked.length} file đang dùng` : ''}`,
            data: { deleted, blocked: force ? [] : blocked, raw: result.deleted || {} },
        });
    } catch (err) { fail(res, err); }
});

module.exports = router;
