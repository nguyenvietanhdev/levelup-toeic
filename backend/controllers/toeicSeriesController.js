const ToeicSeries = require('../models/ToeicSeries');
const ToeicTest = require('../models/ToeicTest');
const ApiError = require('../utils/ApiError');
const { normalizeKeys, testMatchesKeys } = require('../utils/toeicSeries');

// Đếm số đề đang khớp mỗi bộ. Khớp theo TIỀN TỐ nên không query thẳng bằng
// Mongo được (index không phục vụ startsWith trên nhiều khoá); kho đề nhỏ
// (~100 đề) nên nạp source rồi đếm trong bộ nhớ là đủ và đúng.
async function countTests(seriesList) {
    const tests = await ToeicTest.find({ isActive: true })
        .select('source sources')
        .lean();
    return seriesList.map((s) => ({
        ...s,
        testCount: tests.filter((t) => testMatchesKeys(t, s.keys)).length,
    }));
}

// GET /api/toeic-series — public, để frontend dựng thanh lọc bên Full Test.
// Chỉ trả bộ đang bật.
exports.getSeries = async (req, res, next) => {
    try {
        const list = await ToeicSeries.find({ isActive: true })
            .sort({ order: 1, displayName: 1 })
            .select('displayName keys order')
            .lean();
        res.json({ success: true, data: list });
    } catch (err) {
        next(err);
    }
};

// GET /api/toeic-series/all — admin, gồm cả bộ đang tắt + số đề đang khớp
// (để admin biết từ khoá vừa gõ có vơ trúng đề nào không).
exports.getAllSeries = async (req, res, next) => {
    try {
        const list = await ToeicSeries.find()
            .sort({ order: 1, displayName: 1 })
            .lean();
        res.json({ success: true, data: await countTests(list) });
    } catch (err) {
        next(err);
    }
};

// POST /api/toeic-series
exports.createSeries = async (req, res, next) => {
    try {
        const { displayName, keys: rawKeys, order, isActive } = req.body || {};
        const keys = normalizeKeys(rawKeys);
        if (!keys.length) throw ApiError.badRequest('Phải có ít nhất một từ khoá (tiền tố source key)');

        const series = await ToeicSeries.create({
            displayName: String(displayName).trim(),
            keys,
            order: order ?? 0,
            isActive: isActive ?? true,
        });
        res.status(201).json({ success: true, data: series });
    } catch (err) {
        next(err);
    }
};

// PUT /api/toeic-series/:id
exports.updateSeries = async (req, res, next) => {
    try {
        const { displayName, keys: rawKeys, order, isActive } = req.body || {};
        const update = {};
        if (displayName !== undefined) update.displayName = String(displayName).trim();
        if (order !== undefined) update.order = order;
        if (isActive !== undefined) update.isActive = !!isActive;
        if (rawKeys !== undefined) {
            const keys = normalizeKeys(rawKeys);
            if (!keys.length) throw ApiError.badRequest('Phải có ít nhất một từ khoá (tiền tố source key)');
            update.keys = keys;
        }

        const series = await ToeicSeries.findByIdAndUpdate(req.params.id, update, {
            new: true,
            runValidators: true,
        });
        if (!series) throw ApiError.notFound('Không tìm thấy bộ đề');

        res.json({ success: true, data: series });
    } catch (err) {
        next(err);
    }
};

// DELETE /api/toeic-series/:id — xoá danh mục KHÔNG đụng tới đề thi; đề chỉ
// mất chỗ đứng trên thanh lọc và rơi về nhóm "Khác".
exports.deleteSeries = async (req, res, next) => {
    try {
        const series = await ToeicSeries.findByIdAndDelete(req.params.id);
        if (!series) throw ApiError.notFound('Không tìm thấy bộ đề');
        res.json({ success: true, message: 'Đã xoá bộ đề' });
    } catch (err) {
        next(err);
    }
};

// GET /api/toeic-series/suggest — admin: gợi ý từ khoá từ chính source đang có
// trong kho đề, để không phải tự đoán tiền tố. Cắt phần đuôi "t<số>"
// (ets26t10 → ets26) rồi gom lại.
exports.suggestKeys = async (req, res, next) => {
    try {
        const tests = await ToeicTest.find({ isActive: true }).select('source sources').lean();
        const counts = new Map();
        for (const t of tests) {
            const all = [...(t.sources || []), t.source].filter(Boolean);
            for (const raw of all) {
                const prefix = String(raw).trim().toLowerCase().replace(/t\d+$/, '');
                if (!prefix) continue;
                counts.set(prefix, (counts.get(prefix) || 0) + 1);
            }
        }
        const data = [...counts.entries()]
            .map(([key, testCount]) => ({ key, testCount }))
            .sort((a, b) => b.testCount - a.testCount || a.key.localeCompare(b.key));
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
};
