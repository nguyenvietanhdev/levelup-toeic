// Dọn ảnh mồ côi trong public/uploads: file không còn được DB/registry tham chiếu.
// AN TOÀN: gom mọi đường dẫn đang dùng trước khi xoá. Bỏ qua thư mục reports/ (hệ
// thống báo cáo tự quản) và avatars/ (tàn dư cũ).
const path = require('path');
const fs = require('fs');

const ShopItem = require('../models/ShopItem');
const ItemDefinition = require('../models/ItemDefinition');
const SpinConfig = require('../models/SpinConfig');
const UserProfile = require('../models/UserProfile');

const UPLOAD_ROOT = path.join(__dirname, '../public/uploads');
const SKIP_DIRS = new Set(['reports', 'avatars']);

// Ảnh do FRONTEND registry tham chiếu (không nằm trong DB) — không được xoá.
const REGISTRY_WHITELIST = new Set([
    '/uploads/background/bg-vip-week.png',
    '/uploads/background/bg-ocean.jpg',
    '/uploads/background/bg-neon.jpg',
]);

// Tập hợp mọi đường dẫn /uploads/... đang được tham chiếu.
async function collectReferencedPaths() {
    const set = new Set(REGISTRY_WHITELIST);
    const add = (u) => { if (typeof u === 'string' && u.startsWith('/uploads/')) set.add(u); };
    (await ShopItem.find({ image: { $ne: '' } }).select('image').lean()).forEach(d => add(d.image));
    (await ItemDefinition.find({ image: { $ne: '' } }).select('image').lean()).forEach(d => add(d.image));
    (await SpinConfig.find().select('prizes.image').lean()).forEach(c => (c.prizes || []).forEach(p => add(p.image)));
    (await UserProfile.find({ avatar: /^\/uploads\// }).select('avatar').lean()).forEach(d => add(d.avatar));
    return set;
}

function urlToFile(url) {
    return path.join(UPLOAD_ROOT, url.replace(/^\/uploads\//, ''));
}

// Danh sách file mồ côi [{ rel, file, size }].
async function findOrphans() {
    const referenced = await collectReferencedPaths();
    const orphans = [];
    const walk = (dir) => {
        for (const name of fs.readdirSync(dir)) {
            if (dir === UPLOAD_ROOT && SKIP_DIRS.has(name)) continue;
            const p = path.join(dir, name);
            const st = fs.statSync(p);
            if (st.isDirectory()) walk(p);
            else {
                const rel = '/uploads/' + path.relative(UPLOAD_ROOT, p).replace(/\\/g, '/');
                if (!referenced.has(rel)) orphans.push({ rel, file: p, size: st.size });
            }
        }
    };
    if (fs.existsSync(UPLOAD_ROOT)) walk(UPLOAD_ROOT);
    return orphans;
}

// Xoá 1 file NẾU là /uploads/ và không còn ai tham chiếu (dùng khi thay ảnh ở admin).
async function removeIfOrphan(url) {
    if (typeof url !== 'string' || !url.startsWith('/uploads/')) return false;
    const referenced = await collectReferencedPaths();
    if (referenced.has(url)) return false;
    try {
        const f = urlToFile(url);
        if (fs.existsSync(f)) { fs.unlinkSync(f); return true; }
    } catch (_) { /* ignore */ }
    return false;
}

module.exports = { findOrphans, removeIfOrphan, collectReferencedPaths, urlToFile };
