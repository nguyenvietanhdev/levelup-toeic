/**
 * Xem các báo cáo nội dung ngữ pháp bị sai, và khôi phục nếu báo nhầm.
 *
 * Xem:        node scripts/xemBaoSai.js
 * Khôi phục:  node scripts/xemBaoSai.js --khoi-phuc=<id báo cáo>
 */
require('dotenv').config();
const mongoose = require('mongoose');
const NguPhapBaoSai = require('../models/NguPhapBaoSai');
const NguPhapBaiTap = require('../models/NguPhapBaiTap');
const NguPhapMuc = require('../models/NguPhapMuc');

/** Một dòng tóm tắt nội dung bị báo (thuần). */
function tomTat(b) {
    const c = b.banSao || {};
    if (b.loai === 'muc') return `Mục "${c.noiDung?.ten || ''}"`;
    if (c.loai === 'chon') return `Chọn: ${c.de} [${(c.lua || []).join(' | ')}] => ${c.dapAn}`;
    if (c.loai === 'sua') return `Sửa: ${c.sai} => ${c.dung}`;
    return `Dịch: ${c.vi} => ${c.dung}`;
}

async function khoiPhuc(id) {
    const b = await NguPhapBaoSai.findById(id).lean();
    if (!b) throw new Error('Không tìm thấy báo cáo này.');
    if (b.daKhoiPhuc) return console.log('Báo cáo này đã được khôi phục trước đó.');
    if (b.loai === 'cau') {
        await NguPhapBaiTap.updateOne({ mucId: b.mucId }, { $unset: { [`cau.${b.so}.an`]: '' } });
    } else {
        // Trong lúc mục bị ẩn có thể đã có mục mới cùng tên: không đè lên.
        const c = b.banSao;
        if (await NguPhapMuc.exists({ $or: [{ khoa: c.khoa }, { tenChuan: c.tenChuan }] })) {
            throw new Error('Đã có mục mới cùng tên, không khôi phục để tránh trùng.');
        }
        await NguPhapMuc.updateOne({ _id: b.mucId }, { $set: { noiDung: c.noiDung, khoa: c.khoa, tenChuan: c.tenChuan, timKiem: c.timKiem } });
    }
    await NguPhapBaoSai.updateOne({ _id: b._id }, { $set: { daKhoiPhuc: true } });
    return console.log('Đã khôi phục:', tomTat(b));
}

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
    const thamSo = process.argv.find((a) => a.startsWith('--khoi-phuc='));
    if (thamSo) {
        await khoiPhuc(thamSo.slice('--khoi-phuc='.length));
    } else {
        const ds = await NguPhapBaoSai.find({ daKhoiPhuc: false }).sort({ createdAt: -1 }).limit(100).lean();
        console.log(`${ds.length} báo cáo đang hiệu lực`);
        for (const b of ds) console.log(`${b._id} | ${b.mucId} | ${tomTat(b)}`);
    }
    await mongoose.disconnect();
}

if (require.main === module) {
    main().catch((err) => { console.error('LỖI:', err.message); process.exit(1); });
}

module.exports = { tomTat };
