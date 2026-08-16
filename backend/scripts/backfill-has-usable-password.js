/**
 * Đánh dấu `hasUsablePassword: false` cho tài khoản TẠO bằng Google.
 *
 * Vì sao: tài khoản tạo qua Google được gán mật khẩu NGẪU NHIÊN chỉ để qua
 * validate — không ai biết chuỗi đó, kể cả chủ tài khoản. Trước khi có cờ này,
 * màn Cài đặt vẫn hiện form "Đổi mật khẩu" cho họ: gõ gì vào ô "mật khẩu hiện
 * tại" cũng sai, và server trả lỗi mà không nói vì sao.
 *
 * Cờ mới mặc định `true`, nên user CŨ tạo bằng Google vẫn bị hiện form nếu
 * không chạy script này.
 *
 * PHÂN BIỆT QUAN TRỌNG — không phải cứ có `googleId` là không có mật khẩu:
 *
 *   · Đăng ký email+mật khẩu TRƯỚC, sau đó đăng nhập Google → được gắn
 *     googleId, nhưng mật khẩu THẬT vẫn còn và phải đổi được như thường.
 *     → GIỮ NGUYÊN `true`.
 *   · Tạo thẳng bằng Google → mật khẩu là rác.
 *     → Đặt `false`.
 *
 * Hai nhóm này không phân biệt được bằng dữ liệu hiện có một cách chắc chắn.
 * Mốc dùng ở đây: user có `googleId` VÀ `createdAt` gần bằng thời điểm gắn
 * googleId thì coi là tạo bằng Google. Nhưng mốc đó mong manh, nên mặc định
 * script chỉ liệt kê để NGƯỜI xem và quyết định; thêm --apply mới ghi.
 *
 * Nhầm sang `false` cho người CÓ mật khẩu thật thì họ mất lối đổi mật khẩu
 * (vẫn vào được app, vẫn dùng "Quên mật khẩu" được) — khó chịu chứ không mất
 * dữ liệu. Nhầm ngược lại thì họ thấy form chết như cũ.
 *
 * AN TOÀN:
 *   - Mặc định chạy KHÔ (dry-run). Phải thêm --apply mới ghi.
 *   - Ghi backup JSON trước khi đổi.
 *
 * Dùng:
 *   node scripts/backfill-has-usable-password.js            # xem trước
 *   node scripts/backfill-has-usable-password.js --apply    # thực thi
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');

/** Chênh lệch cho phép giữa createdAt và updatedAt để coi là "tạo bằng Google". */
const SAME_MOMENT_MS = 60 * 1000;

(async () => {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) throw new Error('Thiếu MONGO_URI trong .env');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    const col = mongoose.connection.collection('users');

    // Chỉ xét user có googleId và CHƯA được đánh dấu.
    const docs = await col
        .find({ googleId: { $exists: true, $ne: null }, hasUsablePassword: { $ne: false } })
        .project({ _id: 1, email: 1, googleId: 1, createdAt: 1, updatedAt: 1 })
        .toArray();

    if (docs.length === 0) {
        console.log('Không có tài khoản Google nào cần đánh dấu.');
        await mongoose.disconnect();
        return;
    }

    // Tạo bằng Google: googleId có NGAY từ lúc tạo, nên createdAt ≈ lần ghi đầu.
    // Liên kết sau: googleId được gắn ở lần đăng nhập Google, muộn hơn createdAt.
    const created = [];
    const linked = [];
    for (const d of docs) {
        const c = d.createdAt ? new Date(d.createdAt).getTime() : 0;
        const u = d.updatedAt ? new Date(d.updatedAt).getTime() : c;
        (Math.abs(u - c) <= SAME_MOMENT_MS ? created : linked).push(d);
    }

    console.log(`Tổng tài khoản có googleId chưa đánh dấu: ${docs.length}`);
    console.log(`  · Nghi TẠO bằng Google (sẽ đặt false): ${created.length}`);
    for (const d of created) console.log(`      ${d.email}  (tạo ${d.createdAt})`);
    console.log(`  · Nghi LIÊN KẾT sau (giữ nguyên true): ${linked.length}`);
    for (const d of linked) console.log(`      ${d.email}  (tạo ${d.createdAt}, sửa ${d.updatedAt})`);

    if (!APPLY) {
        console.log('\nChạy khô — chưa ghi gì. Xem kỹ danh sách trên rồi thêm --apply.');
        await mongoose.disconnect();
        return;
    }

    if (created.length === 0) {
        console.log('\nKhông có gì để ghi.');
        await mongoose.disconnect();
        return;
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = path.join(__dirname, `backup-has-usable-password-${stamp}.json`);
    fs.writeFileSync(backup, JSON.stringify(created, null, 2), 'utf8');
    console.log(`\nĐã ghi backup: ${backup}`);

    const res = await col.updateMany(
        { _id: { $in: created.map(d => d._id) } },
        { $set: { hasUsablePassword: false } }
    );
    console.log(`Đã cập nhật ${res.modifiedCount} tài khoản.`);

    await mongoose.disconnect();
})().catch(err => {
    console.error(err);
    process.exit(1);
});
