const express = require('express');
const router  = express.Router();
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const { EJSON } = require('bson');
const { protect, authorize } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * Ghi lại một thao tác GHI/XOÁ trên trình quản lý DB.
 *
 * Sáu route ở file này đọc, ghi đè, xoá sạch hoặc drop được bất kỳ collection
 * nào, và trước đây KHÔNG route nào ghi lại ai đã làm — trong khi router
 * Cloudinary ngay bên cạnh log đủ actor trên mọi lần xoá (adminCloudinary.js).
 * `req.user.id` vẫn luôn có sẵn ở đây, chỉ là chưa từng được dùng.
 *
 * Cố ý KHÔNG log nội dung document: audit trail của collection `users` mà chứa
 * luôn dữ liệu users thì nó thành bản sao thứ hai của đúng thứ nó đang mô tả.
 * Chỉ ghi collection, id, và số lượng ảnh hưởng.
 */
const audit = (req, action, detail) =>
    logger.info(`[admin-db] ${action}`, { ...detail, by: String(req.user?.id || 'unknown') });

const admin = [protect, authorize('admin')];

// ── Hai luật về collection, mỗi luật MỘT chỗ ────────────────────────────────
// Trước đây luật "bỏ qua system.*" nằm rải ở 2 trong 6 handler nhận :name, còn
// luật "không được xoá users" chỉ nằm trong đúng route drop. Người đọc thấy một
// chỗ rồi tưởng nó áp khắp nơi — xem SEC-be.admin-api-008 và SYS-001.
//
// Cố ý tách làm HAI chứ không gộp: `users` phải ĐỌC được (không thì bản sao lưu
// vô dụng), chỉ là không được xoá. Gộp một predicate sẽ loại users khỏi export.

/** Collection nội bộ của MongoDB — không đọc, không ghi, không xoá. */
const isInternal = (name) => String(name || '').startsWith('system.');

/** Không được phép XOÁ (drop / xoá sạch). Đọc thì vẫn được. */
const PROTECTED = ['users'];
const isDestructionProtected = (name) => isInternal(name) || PROTECTED.includes(name);

// Chốt duy nhất cho luật `system.*`: Express chạy cái này cho MỌI route có :name,
// kể cả route thêm sau này. Đó là điểm khác biệt so với việc rải `if` vào từng
// handler rồi quên mất một chỗ — chính là cách luật này từng chỉ áp ở 2/6 chỗ.
router.param('name', (req, res, next, name) => {
    if (isInternal(name)) {
        return res.status(403).json({
            success: false,
            message: `Collection "${name}" là collection nội bộ của MongoDB, không thao tác được`,
        });
    }
    next();
});

// ── SAO LƯU TOÀN BỘ DB → 1 file Extended JSON ─────────────────
// EJSON (canonical) giữ nguyên kiểu: ObjectId → {$oid}, Date → {$date}…
// nên import lại không bị mất kiểu/đứt liên kết như JSON thường.
// Ghi THẲNG ra response, từng document một, thay vì gom cả DB vào RAM rồi mới
// gửi. Bản cũ giữ đồng thời: (1) mọi collection dưới dạng mảng JS, (2) một bản
// sao chuỗi của tất cả — đỉnh bộ nhớ khoảng gấp đôi kích thước DB, trên tiến
// trình báo RSS vài chục MB. Trên gói 512MB mà Phase 1 nhắm tới, đó là tự giết
// mình đúng lúc cần bản sao lưu nhất. Giờ đỉnh bộ nhớ là MỘT document.
//
// Định dạng đầu ra giữ nguyên byte-for-byte với bản cũ — adminDbRoundTrip.test.js
// chốt điều đó, vì hợp đồng này là thứ /import dựa vào để đọc lại.
router.get('/export', admin, async (req, res) => {
    try {
        const db = mongoose.connection.db;
        const cols = await db.listCollections().toArray();
        const names = cols.map(c => c.name).filter(n => !isInternal(n));

        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="backup-${stamp}.json"`);

        const meta = EJSON.stringify(
            { exportedAt: new Date(), db: db.databaseName, version: 1 },
            { relaxed: false },
        );
        res.write(`{"_meta":${meta},"collections":{`);

        for (let i = 0; i < names.length; i++) {
            res.write(`${i ? ',' : ''}${JSON.stringify(names[i])}:[`);
            const cursor = db.collection(names[i]).find({});
            let first = true;
            for await (const doc of cursor) {
                res.write((first ? '' : ',') + EJSON.stringify(doc, { relaxed: false }));
                first = false;
            }
            res.write(']');
        }

        res.end('}}');
    } catch (err) {
        // Header đã gửi thì không đổi được status nữa — cắt kết nối để client
        // thấy file hỏng thay vì tưởng đã tải xong một bản sao lưu thiếu.
        if (res.headersSent) return res.destroy(err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── PHỤC HỒI TỪ FILE SAO LƯU ──────────────────────────────────
// Nhận body text thô (file gửi dạng text/plain) — dùng parser riêng giới
// hạn lớn để không vướng limit 2mb của express.json toàn cục.
// ?mode=replace (mặc định: xoá sạch rồi nạp lại) | merge (upsert theo _id).
// `type: () => true` cũ nhận MỌI content-type, nên hạn mức 200mb áp cho bất kỳ
// request nào tới route này. Client gửi 'text/plain' tường minh (db-manager.js)
// nên siết đúng loại đó, và 200mb → 50mb: tiến trình này báo RSS vài chục MB,
// một body 200mb là giết nó trên gói 512MB mà Phase 1 nhắm tới.
router.post('/import', admin, bodyParser.text({ limit: '50mb', type: 'text/plain' }), async (req, res) => {
    try {
        const raw = typeof req.body === 'string' ? req.body : '';
        if (!raw.trim()) return res.status(400).json({ success: false, message: 'File sao lưu trống' });

        let parsed;
        try { parsed = EJSON.parse(raw, { relaxed: false }); }
        catch (e) { return res.status(400).json({ success: false, message: 'File không phải JSON hợp lệ: ' + e.message }); }

        // Chấp nhận cả {collections:{...}} (bản full) lẫn {coll:[...]} trực tiếp.
        const collections = (parsed && parsed.collections && typeof parsed.collections === 'object')
            ? parsed.collections
            : parsed;
        if (!collections || typeof collections !== 'object' || Array.isArray(collections))
            return res.status(400).json({ success: false, message: 'Định dạng backup không đúng' });

        const mode = req.query.mode === 'merge' ? 'merge' : 'replace';
        const db = mongoose.connection.db;

        // ── CHẠY THỬ MẶC ĐỊNH ───────────────────────────────────────────────
        // Không có ?confirm=true thì chỉ báo cáo sẽ làm gì, không đụng dữ liệu.
        // Trước đây mode mặc định là 'replace' và chạy thẳng: một file sao lưu
        // thiếu collection, hay chỉ chứa một collection, là xoá sạch đúng những
        // collection có tên trong file — không diff, không xác nhận, không ảnh
        // chụp trước. Bằng chứng đầu tiên của sự cố là người dùng báo mất tài
        // khoản. Xem SEC-be.admin-api-002.
        const confirmed = req.query.confirm === 'true';

        const targets = Object.entries(collections)
            .filter(([name, docs]) => !isInternal(name) && Array.isArray(docs));

        if (!confirmed) {
            const plan = [];
            for (const [name, docs] of targets) {
                plan.push({
                    collection: name,
                    willClear: mode === 'replace' ? await db.collection(name).countDocuments() : 0,
                    willWrite: docs.length,
                    // Cờ này để UI in đậm: xoá users là tự đăng xuất chính mình.
                    destructionProtected: isDestructionProtected(name),
                });
            }
            return res.json({
                success: true,
                dryRun: true,
                mode,
                plan,
                message: 'Chạy thử — chưa đụng dữ liệu. Gửi lại kèm ?confirm=true để thực thi.',
            });
        }

        const report = [];

        for (const [name, docs] of targets) {
            const col = db.collection(name);
            let cleared = 0, written = 0;

            if (mode === 'replace') {
                cleared = (await col.deleteMany({})).deletedCount;
            }
            if (docs.length) {
                if (mode === 'merge') {
                    const ops = docs.map(d => ({
                        replaceOne: { filter: { _id: d._id }, replacement: d, upsert: true },
                    }));
                    const r = await col.bulkWrite(ops, { ordered: false });
                    written = (r.upsertedCount || 0) + (r.modifiedCount || 0);
                } else {
                    const r = await col.insertMany(docs, { ordered: false });
                    written = r.insertedCount;
                }
            }
            report.push({ collection: name, cleared, written, total: docs.length });
        }

        audit(req, 'import', {
            mode,
            collections: report.length,
            cleared: report.reduce((n, r) => n + r.cleared, 0),
            written: report.reduce((n, r) => n + r.written, 0),
        });
        res.json({ success: true, mode, report });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── Danh sách collections + doc count ─────────────────────────
router.get('/collections', admin, async (req, res) => {
    try {
        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();

        const counts = await Promise.all(
            collections.map(async c => ({
                name: c.name,
                count: await db.collection(c.name).countDocuments(),
            }))
        );

        counts.sort((a, b) => a.name.localeCompare(b.name));
        res.json({ success: true, data: counts });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── Documents trong 1 collection (phân trang + search) ─────────
router.get('/collections/:name', admin, async (req, res) => {
    try {
        const { name } = req.params;
        const page    = Math.max(1, parseInt(req.query.page)  || 1);
        const limit   = Math.min(100, parseInt(req.query.limit) || 20);
        const search  = (req.query.search || '').trim();
        const skip    = (page - 1) * limit;

        const db  = mongoose.connection.db;
        const col = db.collection(name);

        // Text search: thử tìm trong tất cả field kiểu string qua $regex
        let filter = {};
        if (search) {
            // Tìm field string chứa giá trị search (regex case-insensitive)
            // Lấy mẫu 1 doc để biết keys
            const sample = await col.findOne({});
            if (sample) {
                const stringFields = Object.entries(sample)
                    .filter(([, v]) => typeof v === 'string')
                    .map(([k]) => k);
                if (stringFields.length) {
                    filter = {
                        $or: stringFields.map(f => ({
                            [f]: { $regex: search, $options: 'i' }
                        }))
                    };
                }
            }
        }

        const [docs, total] = await Promise.all([
            col.find(filter).skip(skip).limit(limit).toArray(),
            col.countDocuments(filter),
        ]);

        res.json({
            success: true,
            data: docs,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── Insert document vào collection ─────────────────────────────
router.post('/collections/:name', admin, async (req, res) => {
    try {
        const col = mongoose.connection.db.collection(req.params.name);
        const doc = req.body;
        delete doc._id; // không cho client chỉ định _id
        const result = await col.insertOne(doc);
        audit(req, 'insert', { collection: req.params.name, id: String(result.insertedId) });
        res.status(201).json({ success: true, data: { _id: result.insertedId } });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ── Update document ─────────────────────────────────────────────
router.put('/collections/:name/:id', admin, async (req, res) => {
    try {
        const { name, id } = req.params;
        const col = mongoose.connection.db.collection(name);
        const update = { ...req.body };
        delete update._id;

        const { ObjectId } = require('mongodb');
        const _id = ObjectId.isValid(id) ? new ObjectId(id) : id;

        const result = await col.updateOne({ _id }, { $set: update });
        if (result.matchedCount === 0)
            return res.status(404).json({ success: false, message: 'Document không tồn tại' });

        // Chỉ ghi TÊN field bị đổi, không ghi giá trị — xem ghi chú ở audit().
        audit(req, 'update', { collection: name, id: String(id), fields: Object.keys(update) });
        res.json({ success: true, message: 'Đã cập nhật' });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ── Xóa toàn bộ documents trong collection ──────────────────────
router.delete('/collections/:name/all', admin, async (req, res) => {
    try {
        const { name } = req.params;
        // Xoá sạch document cũng phá dữ liệu ngang với drop — cùng luật bảo vệ.
        // Trước đây chỉ route drop kiểm, nên vòng qua đây là xoá được users.
        if (isDestructionProtected(name))
            return res.status(403).json({ success: false, message: `Collection "${name}" được bảo vệ, không thể xóa` });
        const col = mongoose.connection.db.collection(name);
        const result = await col.deleteMany({});
        audit(req, 'delete-all', { collection: name, deleted: result.deletedCount });
        res.json({ success: true, message: `Đã xóa ${result.deletedCount} documents khỏi "${name}"` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── Xóa 1 document ─────────────────────────────────────────────
router.delete('/collections/:name/:id', admin, async (req, res) => {
    try {
        const { name, id } = req.params;
        const col = mongoose.connection.db.collection(name);

        const { ObjectId } = require('mongodb');
        const _id = ObjectId.isValid(id) ? new ObjectId(id) : id;

        const result = await col.deleteOne({ _id });
        if (result.deletedCount === 0)
            return res.status(404).json({ success: false, message: 'Document không tồn tại' });

        audit(req, 'delete-one', { collection: name, id: String(id) });
        res.json({ success: true, message: 'Đã xóa document' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── Drop cả collection ──────────────────────────────────────────
router.delete('/collections/:name', admin, async (req, res) => {
    try {
        const { name } = req.params;
        if (isDestructionProtected(name))
            return res.status(403).json({ success: false, message: `Collection "${name}" được bảo vệ, không thể xóa` });

        await mongoose.connection.db.collection(name).drop();
        audit(req, 'drop', { collection: name });
        res.json({ success: true, message: `Đã drop collection "${name}"` });
    } catch (err) {
        // MongoDB trả lỗi ns not found nếu collection rỗng/không tồn tại
        if (err.message?.includes('ns not found'))
            return res.json({ success: true, message: 'Collection đã trống hoặc không tồn tại' });
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
