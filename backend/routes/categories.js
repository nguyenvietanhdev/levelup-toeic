const express = require('express');
const router = express.Router();
const Category = require('../models/Category');
const ChannelConfig = require('../models/ChannelConfig');
const ItemDefinition = require('../models/ItemDefinition');

// GET /api/categories?domain=shop|quest|achievement — danh mục đang bật, để
// frontend dựng tab. Public (không cần đăng nhập).
router.get('/', async (req, res, next) => {
    try {
        const q = { isActive: true };
        if (req.query.domain) q.domain = req.query.domain;
        const data = await Category.find(q).sort({ domain: 1, order: 1 }).select('domain key label icon order').lean();
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// GET /api/categories/channel/:channel — danh mục kênh này CHỌN (resolved) +
// item ĐÃ XUẤT BẢN thuộc các danh mục đó. Frontend dựng tab + hiển thị sản phẩm.
router.get('/channel/:channel', async (req, res, next) => {
    try {
        const cfg = await ChannelConfig.findOne({ channel: req.params.channel }).lean();
        const keys = (cfg?.categories || []);
        const cats = await Category.find({ domain: 'item', key: { $in: keys }, isActive: true })
            .sort({ order: 1 }).select('key label icon order').lean();
        // Giữ thứ tự danh mục theo cats; item lọc published + isActive + thuộc keys.
        const items = keys.length
            ? await ItemDefinition.find({ published: true, isActive: true, category: { $in: keys } })
                .sort({ order: 1 }).lean()
            : [];
        res.json({ success: true, data: { categories: cats, items } });
    } catch (err) { next(err); }
});

module.exports = router;
