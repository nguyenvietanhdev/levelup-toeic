/**
 * Nhập kho từ SONG NGỮ (Trung ↔ Anh) từ file CSV hoặc JSON.
 *
 *   node scripts/importVocabBi.js <file> [--source ten_bo] [--that]
 *
 * Mặc định chạy THỬ: đọc, kiểm, in ra những gì sẽ xảy ra, KHÔNG ghi DB.
 * Thêm `--that` mới ghi thật.
 *
 * Chạy thử trước là mặc định vì nạp tay hay sai lặt vặt (thiếu cột, lẫn dòng
 * tiêu đề, trùng chữ Hán), mà sửa dữ liệu đã ghi tốn công hơn nhiều so với đọc
 * một bản báo cáo.
 *
 * Idempotent: chạy lại chỉ CẬP NHẬT theo (source + zh), không tạo bản trùng.
 *
 * ── Định dạng CSV ──────────────────────────────────────────────────────────
 *
 *   zh,en,phoneticZh,phoneticEn,part
 *   你好,hello,nǐ hǎo,/həˈloʊ/,Chào hỏi
 *
 * Bắt buộc: `zh`, `en`, `part`. Còn lại tuỳ chọn, thiếu thì để rỗng.
 *
 * KHÔNG có cột `vn`: kho này học Trung ↔ Anh, `en` chính là đáp án.
 * Cột thừa bị bỏ qua chứ không báo lỗi — file của bạn muốn có cột ghi chú
 * riêng cũng được.
 *
 * ── Định dạng JSON ─────────────────────────────────────────────────────────
 *
 *   [ { "zh":"你好", "en":"hello", "part":"Chào hỏi" }, … ]
 */
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const VocabularyBi = require('../models/VocabularyBi');

const BAT_BUOC = ['zh', 'en', 'part'];

/**
 * Tách một dòng CSV, hiểu dấu ngoặc kép.
 *
 * Không dùng `split(',')`: câu ví dụ và nghĩa nhiều lớp hay có dấu phẩy
 * ("contract, agreement") và tách thô sẽ đẩy nửa sau sang cột kế tiếp — hỏng
 * âm thầm, không báo lỗi gì.
 */
function tachDong(dong) {
    const o = [];
    let cur = '';
    let trongNgoac = false;
    for (let i = 0; i < dong.length; i += 1) {
        const c = dong[i];
        if (c === '"') {
            // "" bên trong ngoặc = một dấu " thật
            if (trongNgoac && dong[i + 1] === '"') { cur += '"'; i += 1; }
            else trongNgoac = !trongNgoac;
        } else if (c === ',' && !trongNgoac) {
            o.push(cur); cur = '';
        } else {
            cur += c;
        }
    }
    o.push(cur);
    return o.map((x) => x.trim());
}

function docCsv(noiDung) {
    // Bỏ BOM: Excel lưu UTF-8 hay chèn, và nó dính vào tên cột đầu tiên khiến
    // `zh` thành `﻿zh` — kiểm cột nào cũng trượt mà nhìn mắt thường y hệt.
    const sach = noiDung.replace(/^﻿/, '');
    const dong = sach.split(/\r?\n/).filter((d) => d.trim());
    if (!dong.length) return { cot: [], hang: [] };

    const cot = tachDong(dong[0]);
    const hang = dong.slice(1).map((d) => {
        const o = tachDong(d);
        return Object.fromEntries(cot.map((c, i) => [c, o[i] ?? '']));
    });
    return { cot, hang };
}

function doc(duongDan) {
    const noiDung = fs.readFileSync(duongDan, 'utf8');
    if (path.extname(duongDan).toLowerCase() === '.json') {
        const j = JSON.parse(noiDung.replace(/^﻿/, ''));
        if (!Array.isArray(j)) throw new Error('JSON phải là một MẢNG các bản ghi');
        return { cot: Object.keys(j[0] || {}), hang: j };
    }
    return docCsv(noiDung);
}

/** Kiểm một bản ghi. Trả mảng lỗi, rỗng = hợp lệ. */
function kiem(h, i) {
    const loi = [];
    for (const c of BAT_BUOC) {
        if (!String(h[c] || '').trim()) loi.push(`dòng ${i + 2}: thiếu \`${c}\``);
    }
    // Cảnh báo chứ không chặn: `hienThi` mặc định 'zh', nhưng nếu ô `zh` không
    // có chữ Hán nào thì nhiều khả năng người nhập đã đảo cột.
    const zh = String(h.zh || '');
    if (zh && !/[一-鿿㐀-䶿]/.test(zh)) {
        loi.push(`dòng ${i + 2}: cột \`zh\` ("${zh}") không có chữ Hán — đảo cột?`);
    }
    return loi;
}

async function main() {
    const args = process.argv.slice(2);
    const file = args.find((a) => !a.startsWith('--'));
    const that = args.includes('--that');
    const iSrc = args.indexOf('--source');
    const source = iSrc >= 0 ? args[iSrc + 1] : 'song_ngu';

    if (!file) {
        console.error('Thiếu tên file.\n  node scripts/importVocabBi.js <file.csv> [--source ten_bo] [--that]');
        process.exit(1);
    }
    if (!fs.existsSync(file)) {
        console.error(`Không thấy file: ${file}`);
        process.exit(1);
    }

    const { cot, hang } = doc(file);
    console.log(`File   : ${file}`);
    console.log(`Cột    : ${cot.join(', ')}`);
    console.log(`Số dòng: ${hang.length}`);
    console.log(`Bộ     : ${source}`);
    console.log(that ? '\n*** GHI THẬT ***\n' : '\n*** CHẠY THỬ — không ghi DB (thêm --that để ghi) ***\n');

    const thieuCot = BAT_BUOC.filter((c) => !cot.includes(c));
    if (thieuCot.length) {
        console.error(`Thiếu cột bắt buộc: ${thieuCot.join(', ')}`);
        process.exit(1);
    }

    // Kiểm toàn bộ TRƯỚC khi ghi dòng nào: ghi được nửa chừng rồi mới báo lỗi
    // thì phải tự dò xem đã vào tới đâu.
    const loi = [];
    const thayTrongFile = new Map();
    hang.forEach((h, i) => {
        loi.push(...kiem(h, i));
        const k = String(h.zh || '').trim();
        if (k) {
            if (thayTrongFile.has(k)) loi.push(`dòng ${i + 2}: trùng \`zh\` với dòng ${thayTrongFile.get(k)}`);
            else thayTrongFile.set(k, i + 2);
        }
    });

    if (loi.length) {
        console.error(`Có ${loi.length} lỗi, KHÔNG ghi gì cả:\n`);
        for (const l of loi.slice(0, 30)) console.error('  ' + l);
        if (loi.length > 30) console.error(`  … và ${loi.length - 30} lỗi nữa`);
        process.exit(1);
    }
    console.log('Kiểm dữ liệu: hợp lệ.');

    const docs = hang.map((h) => ({
        zh: String(h.zh).trim(),
        en: String(h.en).trim(),
        hienThi: h.hienThi === 'en' ? 'en' : 'zh',
        phoneticZh: String(h.phoneticZh || '').trim(),
        phoneticEn: String(h.phoneticEn || '').trim(),
        exampleZh: String(h.exampleZh || '').trim(),
        exampleEn: String(h.exampleEn || '').trim(),
        part: String(h.part).trim(),
        type: String(h.type || '').trim(),
        level: String(h.level || '').trim(),
        source,
    }));

    if (!that) {
        console.log('\n3 bản ghi đầu sẽ ghi:');
        for (const d of docs.slice(0, 3)) console.log('  ' + JSON.stringify(d));
        const parts = [...new Set(docs.map((d) => d.part))];
        console.log(`\nCác Part (${parts.length}): ${parts.join(' · ')}`);
        console.log('\nChạy lại với --that để ghi thật.');
        return;
    }

    await mongoose.connect(process.env.MONGODB_URI);

    let them = 0;
    let capNhat = 0;
    for (const d of docs) {
        const co = await VocabularyBi.findOne({ source, zh: d.zh }).select('_id').lean();
        if (co) {
            await VocabularyBi.updateOne({ _id: co._id }, { $set: d });
            capNhat += 1;
        } else {
            await VocabularyBi.create(d);
            them += 1;
        }
    }

    const tong = await VocabularyBi.countDocuments({ source });
    console.log(`Thêm mới: ${them} · Cập nhật: ${capNhat} · Tổng trong bộ: ${tong}`);

    const parts = await VocabularyBi.aggregate([
        { $match: { source } },
        { $group: { _id: '$part', n: { $sum: 1 } } },
        { $sort: { _id: 1 } },
    ]);
    console.log('\nCác Part:');
    for (const p of parts) console.log(`  ${String(p._id).padEnd(24)} ${p.n} từ`);

    await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
