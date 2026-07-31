const express = require('express');
const router  = express.Router();
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const { EJSON } = require('bson');
const { protect, authorize } = require('../middleware/auth');

const admin = [protect, authorize('admin')];

// ── SAO LƯU TOÀN BỘ DB → 1 file Extended JSON ─────────────────
// EJSON (canonical) giữ nguyên kiểu: ObjectId → {$oid}, Date → {$date}…
// nên import lại không bị mất kiểu/đứt liên kết như JSON thường.
router.get('/export', admin, async (req, res) => {
    try {
        const db = mongoose.connection.db;
        const cols = await db.listCollections().toArray();
        const collections = {};
        for (const c of cols) {
            if (c.name.startsWith('system.')) continue;
            collections[c.name] = await db.collection(c.name).find({}).toArray();
        }
        const body = EJSON.stringify(
            { _meta: { exportedAt: new Date(), db: db.databaseName, version: 1 }, collections },
            { relaxed: false }
        );
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="backup-${stamp}.json"`);
        res.send(body);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── PHỤC HỒI TỪ FILE SAO LƯU ──────────────────────────────────
// Nhận body text thô (file gửi dạng text/plain) — dùng parser riêng giới
// hạn lớn để không vướng limit 2mb của express.json toàn cục.
// ?mode=replace (mặc định: xoá sạch rồi nạp lại) | merge (upsert theo _id).
router.post('/import', admin, bodyParser.text({ limit: '200mb', type: () => true }), async (req, res) => {
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
        const report = [];

        for (const [name, docs] of Object.entries(collections)) {
            if (name.startsWith('system.') || !Array.isArray(docs)) continue;
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

        res.json({ success: true, message: 'Đã cập nhật' });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ── Xóa toàn bộ documents trong collection ──────────────────────
router.delete('/collections/:name/all', admin, async (req, res) => {
    try {
        const { name } = req.params;
        const col = mongoose.connection.db.collection(name);
        const result = await col.deleteMany({});
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

        res.json({ success: true, message: 'Đã xóa document' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── Drop cả collection ──────────────────────────────────────────
router.delete('/collections/:name', admin, async (req, res) => {
    try {
        const { name } = req.params;
        const PROTECTED = ['users']; // collection không được drop
        if (PROTECTED.includes(name))
            return res.status(403).json({ success: false, message: `Collection "${name}" được bảo vệ, không thể xóa` });

        await mongoose.connection.db.collection(name).drop();
        res.json({ success: true, message: `Đã drop collection "${name}"` });
    } catch (err) {
        // MongoDB trả lỗi ns not found nếu collection rỗng/không tồn tại
        if (err.message?.includes('ns not found'))
            return res.json({ success: true, message: 'Collection đã trống hoặc không tồn tại' });
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
