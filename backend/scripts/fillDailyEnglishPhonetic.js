/**
 * Sinh phiên âm IPA cho bộ "Giao tiếp hằng ngày".
 *
 *   node scripts/fillDailyEnglishPhonetic.js
 *
 * Tách khỏi `seedDailyEnglish.js` vì hai việc khác hẳn nhau về chi phí: seed là
 * ghi DB thuần (chạy lại bao nhiêu lần cũng được), còn cái này gọi AI cho từng
 * câu — tốn tiền và mất vài phút. Gộp làm một thì mỗi lần sửa một chữ trong bộ
 * từ lại trả tiền cho cả 109 câu.
 *
 * Idempotent: bỏ qua câu đã có `phonetic`. Chạy lại chỉ điền chỗ còn trống,
 * nên đứt giữa chừng thì chạy tiếp là xong.
 */
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const Vocabulary = require('../models/Vocabulary');
const { layPhienAmCau } = require('../services/sentencePhonetic');

const SOURCE = 'giao_tiep_250';

/** Nghỉ giữa các lần gọi — tránh dồn request vào nhà cung cấp AI. */
const NGHI_MS = 250;
const cho = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);

    const canLam = await Vocabulary.find({
        source: SOURCE,
        $or: [{ phonetic: '' }, { phonetic: null }, { phonetic: { $exists: false } }],
    }).select('_id en part').lean();

    console.log(`Cần sinh phiên âm: ${canLam.length} câu`);
    if (!canLam.length) {
        await mongoose.disconnect();
        return;
    }

    let xong = 0;
    let bo = 0;
    for (const w of canLam) {
        // Khung câu lõi KHÔNG sinh phiên âm: `Can / Could you + V?` không phải
        // một câu đọc được — phiên âm của nó là vô nghĩa, và AI sẽ bịa ra một
        // chuỗi trông giống IPA cho phần `+ V`.
        if (w.part === '0. Khung câu lõi') {
            bo++;
            continue;
        }

        const r = await layPhienAmCau({ cau: w.en });
        if (r.success && r.phonetic) {
            await Vocabulary.updateOne({ _id: w._id }, { $set: { phonetic: `/${r.phonetic}/` } });
            xong++;
            process.stdout.write('.');
        } else {
            bo++;
            process.stdout.write('x');
        }
        await cho(NGHI_MS);
    }

    console.log(`\nXong: ${xong} · Bỏ qua/thất bại: ${bo}`);
    const con = await Vocabulary.countDocuments({
        source: SOURCE, phonetic: { $nin: ['', null] },
    });
    console.log(`Tổng câu đã có phiên âm: ${con}`);

    await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
