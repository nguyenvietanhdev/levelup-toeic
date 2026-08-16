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
 * Hai nhóm này KHÔNG phân biệt được bằng dữ liệu hiện có:
 *
 *   · Mốc thời gian không dùng được. Đã thử `createdAt` ≈ `updatedAt` và hỏng:
 *     `/auth/me` ghi lại `lastLoginAt` mỗi phút nên `updatedAt` LUÔN muộn hơn
 *     `createdAt` — mọi tài khoản đều bị xếp nhầm vào nhóm "liên kết sau".
 *   · Mật khẩu cũng không giúp: cả hai nhóm đều là hash bcrypt 60 ký tự, không
 *     đọc ngược được để biết bên trong là mật khẩu thật hay chuỗi rác.
 *
 * Nên script KHÔNG đoán. Nó liệt kê tài khoản gắn Google kèm trạng thái hiện
 * tại, còn chọn email nào là việc của người chạy — người dùng tự biết mình đăng
 * ký kiểu gì.
 *
 * Nhầm sang `false` cho người CÓ mật khẩu thật thì họ mất lối đổi mật khẩu (vẫn
 * vào được app, vẫn dùng "Quên mật khẩu" được) — khó chịu chứ không mất dữ
 * liệu, và --undo hoàn tác được. Nhầm ngược lại thì họ thấy form chết như cũ.
 *
 * AN TOÀN:
 *   - Mặc định chạy KHÔ (dry-run). Phải thêm --apply mới ghi.
 *   - Ghi backup JSON trước khi đổi.
 *   - --undo để trả lại `true`.
 *
 * Dùng:
 *   # liệt kê, chưa đụng gì
 *   node scripts/backfill-has-usable-password.js
 *   # xem trước cho email cụ thể
 *   node scripts/backfill-has-usable-password.js --emails=a@gmail.com
 *   # thực thi
 *   node scripts/backfill-has-usable-password.js --emails=a@gmail.com --apply
 *   # hoàn tác
 *   node scripts/backfill-has-usable-password.js --emails=a@gmail.com --apply --undo
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');

/**
 * Email cần đặt `hasUsablePassword: false`, truyền qua --emails=a@x.com,b@y.com
 *
 * KHÔNG đoán bằng mốc thời gian. Đã thử `createdAt` ≈ `updatedAt` và HỎNG:
 * `/auth/me` ghi lại `lastLoginAt` mỗi phút nên `updatedAt` LUÔN muộn hơn
 * `createdAt`, bất kể tài khoản tạo kiểu gì — mọi tài khoản đều rơi vào nhóm
 * "liên kết sau", kể cả tài khoản tạo thẳng bằng Google.
 *
 * Mật khẩu cũng không giúp phân biệt: cả hai nhóm đều là hash bcrypt 60 ký tự,
 * không đọc ngược được để biết bên trong là mật khẩu thật hay chuỗi rác.
 *
 * Nên để NGƯỜI chỉ định. Đặt nhầm `false` cho người có mật khẩu thật thì họ mất
 * lối đổi mật khẩu (vẫn vào được app, vẫn dùng "Quên mật khẩu" được) — khó chịu
 * chứ không mất dữ liệu, và chạy lại script với --undo là hoàn tác được.
 */
const emailArg = process.argv.find(a => a.startsWith('--emails='));
const EMAILS = emailArg
    ? emailArg.slice('--emails='.length).split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    : [];
const UNDO = process.argv.includes('--undo');

(async () => {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) throw new Error('Thiếu MONGO_URI trong .env');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    const col = mongoose.connection.collection('users');

    const docs = await col
        .find({ googleId: { $exists: true, $ne: null } })
        .project({ _id: 1, email: 1, googleId: 1, createdAt: 1, hasUsablePassword: 1 })
        .toArray();

    if (docs.length === 0) {
        console.log('Không có tài khoản nào gắn Google.');
        await mongoose.disconnect();
        return;
    }

    console.log(`Tài khoản có googleId: ${docs.length}\n`);
    for (const d of docs) {
        const cur = d.hasUsablePassword === false ? 'false (đã chặn)' : 'true  (đổi được)';
        const mark = EMAILS.includes((d.email || '').toLowerCase()) ? ' ←' : '';
        console.log(`  ${cur}  ${d.email}   tạo ${d.createdAt}${mark}`);
    }

    if (EMAILS.length === 0) {
        console.log('\nChưa chọn email nào. Cách dùng:');
        console.log('  # xem trước');
        console.log('  node scripts/backfill-has-usable-password.js --emails=a@gmail.com');
        console.log('  # thực thi');
        console.log('  node scripts/backfill-has-usable-password.js --emails=a@gmail.com --apply');
        console.log('  # hoàn tác');
        console.log('  node scripts/backfill-has-usable-password.js --emails=a@gmail.com --apply --undo');
        console.log('\nChọn email của tài khoản TẠO THẲNG bằng Google (chưa từng đặt mật khẩu).');
        await mongoose.disconnect();
        return;
    }

    const known = new Set(docs.map(d => (d.email || '').toLowerCase()));
    const missing = EMAILS.filter(e => !known.has(e));
    if (missing.length) {
        console.log(`\nKHÔNG tìm thấy (hoặc không gắn Google): ${missing.join(', ')}`);
    }

    const created = docs.filter(d => EMAILS.includes((d.email || '').toLowerCase()));
    const nextVal = UNDO;   // --undo → true (mở lại), mặc định → false (chặn)
    console.log(`\nSẽ đặt hasUsablePassword = ${nextVal} cho ${created.length} tài khoản:`);
    for (const d of created) console.log(`      ${d.email}`);

    if (!APPLY) {
        console.log('\nChạy khô — chưa ghi gì. Thêm --apply để thực thi.');
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
        { $set: { hasUsablePassword: nextVal } }
    );
    console.log(`Đã cập nhật ${res.modifiedCount} tài khoản.`);
    console.log('Người dùng liên quan cần F5 / đăng nhập lại để client nhận cờ mới.');

    await mongoose.disconnect();
})().catch(err => {
    console.error(err);
    process.exit(1);
});
