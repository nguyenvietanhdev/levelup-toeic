#!/usr/bin/env node
/**
 * ĐO BỘ CHẤM VIẾT với AI thật. Chạy tay, không nằm trong `npm test` (tốn tiền, kết quả dao động).
 *
 *   node eval/chamViet/chay.js            # mỗi bài chấm 3 lần
 *   node eval/chamViet/chay.js --lan 5
 *
 * Dùng đúng nhà cung cấp AI đang chọn ở admin (đọc cấu hình từ database), nên mỗi lần đổi hãng
 * hay sửa prompt chấm thì chạy lại để biết chất lượng chấm có đổi không. Kết quả ghi vào
 * `eval/chamViet/ket-qua/<thời điểm>.json` (không đưa lên git) và in bảng tóm tắt.
 *
 * Ghi chú: mỗi lần gọi AI vẫn được ghi vào nhật ký chi phí AI như mọi lần chấm khác.
 */
const path = require('path');
const fs = require('fs');

const B = path.join(__dirname, '..', '..');
process.chdir(B);
require(path.join(B, 'node_modules', 'dotenv')).config({ path: path.join(B, '.env') });
const mongoose = require(path.join(B, 'node_modules', 'mongoose'));
const { gradeEssay } = require(path.join(B, 'services', 'essayGrader'));
const { DE, BAI } = require('./mau');
const { daoDong, tiLeBatLoi, kiemThuTu, doLechHienThi } = require('./doLuong');

/** Nhãn tính năng của lời gọi chấm Viết (để biết đang dùng hãng/model nào). */
const TINH_NANG = 'essay-grade';
const soLan = Math.max(1, Math.min(10, Number((process.argv.find((a, i) => process.argv[i - 1] === '--lan')) || 3)));

(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const ketQua = [];
    for (const b of BAI) {
        const lan = [];
        for (let i = 0; i < soLan; i += 1) {
            const r = await gradeEssay({ prompt: DE, essay: b.bai, lang: 'en', rubric: 'ielts' });
            if (!r.success) { console.log(`  ${b.id} lần ${i + 1}: LỖI ${r.error || ''}`); continue; }
            lan.push(r.result);
            process.stdout.write('.');
        }
        const tieuChi = {};
        for (const k of Object.keys(lan[0]?.scores || {})) tieuChi[k] = daoDong(lan.map((x) => x.scores[k]));
        ketQua.push({
            id: b.id,
            ten: b.ten,
            mucDuKien: b.mucDuKien,
            overall: daoDong(lan.map((x) => x.overall)),
            tieuChi,
            ...(b.loiCai ? { batLoi: lan.map((x) => tiLeBatLoi(b.loiCai, x.errors)) } : {}),
        });
    }
    console.log('\n');

    const thuTu = kiemThuTu(ketQua);
    const doLech = doLechHienThi(ketQua);
    // Ghi lại hãng/model đã chấm: kết quả chỉ so được với lần đo cùng hãng/model.
    const nhaCungCap = await require(path.join(B, 'services', 'aiClient')).resolveFor(TINH_NANG)
        .then((r) => ({ hang: r.providerId, model: r.model })).catch(() => null);

    console.log(`Hãng/model: ${nhaCungCap ? `${nhaCungCap.hang} / ${nhaCungCap.model}` : 'không rõ'} · ${soLan} lần mỗi bài
`);
    console.log('Bài'.padEnd(26), 'Band tổng (các lần)'.padEnd(22), 'Chênh', ' Tiêu chí lệch nhiều nhất');
    for (const k of ketQua) {
        const tcLech = Object.entries(k.tieuChi).sort((a, b) => (b[1]?.chenh || 0) - (a[1]?.chenh || 0))[0];
        console.log(
            k.ten.padEnd(26),
            `${k.overall?.tb ?? '-'} (${k.overall?.thap ?? '-'}–${k.overall?.cao ?? '-'})`.padEnd(22),
            String(k.overall?.chenh ?? '-').padEnd(6),
            tcLech ? `${tcLech[0]} ${tcLech[1]?.thap}–${tcLech[1]?.cao}` : '',
        );
        if (k.batLoi) {
            const bat = k.batLoi.map((x) => `${x.bat}/${x.tong}`).join(', ');
            const sot = [...new Set(k.batLoi.flatMap((x) => x.sot))];
            console.log(''.padEnd(26), `Bắt lỗi cài sẵn: ${bat}${sot.length ? ` — hay sót: ${sot.join(' | ')}` : ''}`);
        }
    }
    console.log(`\nThứ tự yếu < vừa < tốt: ${thuTu.dung ? 'ĐÚNG' : `SAI (${thuTu.sai.join('; ')})`}`);
    console.log(`Độ lệch nên hiện cho người học: ±${doLech} band`);

    const thuMuc = path.join(__dirname, 'ket-qua');
    fs.mkdirSync(thuMuc, { recursive: true });
    const tep = path.join(thuMuc, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(tep, JSON.stringify({ luc: new Date(), soLan, nhaCungCap, thuTu, doLech, ketQua }, null, 2));
    console.log(`Đã ghi: ${path.relative(B, tep)}`);
    await mongoose.disconnect();
    process.exit(0);
})().catch((e) => { console.error('LỖI:', e.message); process.exit(1); });
