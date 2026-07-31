/**
 * Xoá file trong backend/public/assets/ khi nó ĐÃ có bản trên Cloudinary
 * (được DB tham chiếu bằng URL cloud trùng tên). Cloudinary là nguồn chính;
 * giữ file local vừa thừa vừa vô nghĩa (đĩa deploy ephemeral).
 *
 * AN TOÀN: chỉ xoá file mà tên (không đuôi) khớp một URL cloudinary trong DB.
 * File không tìm thấy trên cloud → GIỮ LẠI + cảnh báo (không xoá mù).
 *
 *   node scripts/pruneLocalAssets.js           # dry-run (chỉ in)
 *   node scripts/pruneLocalAssets.js --apply    # xoá thật
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const Q = require('../models/ToeicQuestionSet');

const APPLY = process.argv.includes('--apply');
const ASSETS = path.join(__dirname, '..', 'public', 'assets');

// Duyệt cây thư mục, trả về danh sách file tuyệt đối.
const walk = (dir) => {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? walk(p) : [p];
    });
};

(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(`DB: ${mongoose.connection.name} | mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

    // Gom mọi "basename" (không đuôi) xuất hiện trong URL cloudinary của DB.
    const cloudNames = new Set();
    const scan = (o) => {
        for (const k in o) {
            const v = o[k];
            if (typeof v === 'string' && v.includes('res.cloudinary.com')) {
                cloudNames.add(path.parse(v.split('?')[0]).name);
            } else if (v && typeof v === 'object') scan(v);
        }
    };
    (await Q.find({}).lean()).forEach(scan);
    console.log(`DB đang tham chiếu ${cloudNames.size} asset trên Cloudinary.\n`);

    const files = walk(ASSETS);
    let del = 0; const kept = [];
    for (const abs of files) {
        const base = path.parse(abs).name;
        const rel = path.relative(ASSETS, abs).replace(/\\/g, '/');
        if (cloudNames.has(base)) {
            console.log(`  xoá  ${rel}`);
            if (APPLY) fs.unlinkSync(abs);
            del++;
        } else {
            kept.push(rel);
        }
    }

    console.log(`\n${APPLY ? 'Đã xoá' : 'Sẽ xoá'} ${del} file (đã có trên cloud).`);
    if (kept.length) {
        console.log(`\nGIỮ LẠI ${kept.length} file — CHƯA thấy trên cloud (kiểm lại trước khi xoá tay):`);
        kept.forEach((r) => console.log('   ', r));
    }

    // Dọn thư mục rỗng còn sót.
    if (APPLY) {
        const dirs = walk(ASSETS).length ? [] : [];
        const rmEmpty = (dir) => {
            if (!fs.existsSync(dir)) return;
            fs.readdirSync(dir).forEach((n) => { const p = path.join(dir, n); if (fs.statSync(p).isDirectory()) rmEmpty(p); });
            if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0 && dir !== ASSETS) fs.rmdirSync(dir);
        };
        rmEmpty(ASSETS);
    }
    await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
