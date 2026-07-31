/**
 * Đổi tên file mp3 nguồn (vd `E26-T01-50-52.mp3`) sang đúng định dạng của app
 * (`ets26t1-50-52.mp3`) rồi CHUYỂN vào backend để sẵn sàng upload.
 *
 * Cách dùng:
 *   1. Copy các file mp3 vào chính thư mục audio-import/ này.
 *   2. Chạy:  node rename-audio.js
 *      → script sẽ HỎI "đề số mấy?" (nhập 1..10), xem trước rồi mới đổi.
 *      (hoặc truyền thẳng số: node rename-audio.js 1)
 *   3. Sau đó chạy upload:  cd ../backend && node scripts/uploadMissingAudio.js ets26t1 --apply
 *
 * Quy tắc đổi tên:  E<ver>-T<test>-<dải câu>.mp3  →  ets<ver>t<đề đã nhập>-<dải câu>.mp3
 *   E26-T01-50-52.mp3  →  ets26t1-50-52.mp3
 * Phần "đề số" LẤY THEO SỐ BẠN NHẬP (không lấy T## trong tên) để bạn chủ động.
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const DIR = __dirname;
// Nhận cả E26-T01-71-73.mp3 lẫn E26-T1-71-73.mp3; nhóm 1=version(26), 2=dải câu.
const SRC_RE = /^E(\d+)-T\d+-(.+)\.mp3$/i;

const ask = (q) => new Promise((res) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, (a) => { rl.close(); res(a.trim()); });
});

(async () => {
    const files = fs.readdirSync(DIR).filter((f) => SRC_RE.test(f));
    if (!files.length) {
        console.log('Không thấy file mp3 dạng "E26-T01-xx-yy.mp3" trong thư mục này.');
        console.log('→ Copy các file mp3 vào', DIR, 'rồi chạy lại.');
        return;
    }

    // Số đề: lấy từ tham số dòng lệnh nếu có, không thì HỎI.
    let arg = process.argv[2];
    let testNo = /^\d+$/.test(arg || '') ? parseInt(arg, 10) : NaN;
    while (!(testNo >= 1 && testNo <= 20)) {
        const a = await ask(`Tìm thấy ${files.length} file. Đây là đề số mấy? (ets26t?, nhập 1-10): `);
        testNo = parseInt(a, 10);
        if (!(testNo >= 1 && testNo <= 20)) console.log('  ⚠ Nhập một số từ 1 đến 10.');
    }

    // Lập kế hoạch đổi tên.
    const plan = files.map((from) => {
        const m = from.match(SRC_RE);
        const ver = m[1];          // 26
        const range = m[2];        // 50-52
        return { from, to: `ets${ver}t${testNo}-${range}.mp3` };
    });

    console.log(`\nSẽ đổi tên ${plan.length} file thành ĐỀ ets26t${testNo}:`);
    plan.forEach((p) => console.log(`   ${p.from}   →   ${p.to}`));

    const dest = path.join(DIR, '..', 'backend', 'public', 'assets', 'audio', `ets26t${testNo}`);
    console.log(`\nSau khi đổi tên sẽ CHUYỂN vào:\n   ${path.resolve(dest)}`);

    const ok = (await ask('\nĐồng ý? (y/n): ')).toLowerCase();
    if (ok !== 'y' && ok !== 'yes') { console.log('Đã huỷ, không đổi gì.'); return; }

    fs.mkdirSync(dest, { recursive: true });
    let done = 0, skip = 0;
    for (const p of plan) {
        const target = path.join(dest, p.to);
        if (fs.existsSync(target)) { console.log('  (bỏ qua, đã tồn tại)', p.to); skip++; continue; }
        fs.renameSync(path.join(DIR, p.from), target);
        done++;
    }
    console.log(`\n✓ Đổi tên + chuyển ${done} file${skip ? `, bỏ qua ${skip}` : ''}.`);
    console.log(`Bước tiếp theo (upload lên Cloudinary + gán vào đề):`);
    console.log(`   cd ../backend && node scripts/uploadMissingAudio.js ets26t${testNo} --apply`);
})().catch((e) => { console.error(e); process.exit(1); });
