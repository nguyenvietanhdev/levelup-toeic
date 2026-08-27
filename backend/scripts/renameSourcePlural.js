/**
 * Đổi GIÁ TRỊ `source`: pronoun → pronouns, adverb → adverbs.
 *
 *   node scripts/renameSourcePlural.js            # chạy thử, không ghi
 *   node scripts/renameSourcePlural.js --that     # ghi thật
 *
 * Chỉ đổi giá trị, không đụng bất kỳ trường nào khác. `type` giữ nguyên số ít
 * (`type: 'adverb'`) — đó là từ loại của từng từ, không liên quan tới tên bộ.
 *
 * ── Vì sao phải đổi ở HAI nơi ──────────────────────────────────────────────
 *
 * `vocabularies_topics.sourceKeys` trỏ ngược về `source` của kho từ — đó là
 * cách bộ đề biết mình gồm những từ nào. Đổi mỗi kho từ thì hai bộ đề
 * "ADVERBS" và "PRONOUN" vẫn trỏ tới tên cũ và mở ra 0 từ, mà không có lỗi
 * nào báo: `countWords` chỉ đếm được 0 rồi thôi.
 *
 * Mặc định chạy thử vì đây là lệnh ghi đè hàng loạt trên dữ liệu thật và
 * không có transaction để hoàn tác.
 */
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');

/** cũ → mới. Chỉ hai cặp, khai tường minh để không đổi nhầm bằng regex. */
const DOI = {
    pronoun: 'pronouns',
    adverb: 'adverbs',
};

const CU = Object.keys(DOI);
const MOI = Object.values(DOI);

/** Kho từ có thể mang `source` này. Kho `bi` nạp tay nên cũng phải quét. */
const KHO_TU = ['vocabularies_en', 'vocabularies_zh', 'vocabularies_bi', 'user_upload'];

async function main() {
    const that = process.argv.includes('--that');

    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
    const db = mongoose.connection.db;

    console.log(that ? '*** GHI THẬT ***\n' : '*** CHẠY THỬ — không ghi gì (thêm --that để ghi) ***\n');

    // ── Kiểm TRƯỚC: tên mới đã tồn tại chưa? ───────────────────────────────
    //
    // Nếu có sẵn bộ tên `adverbs` thì lệnh này GỘP hai bộ làm một mà không ai
    // biết — và không có đường tách lại, vì sau khi ghi thì mọi bản ghi trông
    // giống hệt nhau.
    let dungLai = false;
    for (const c of KHO_TU) {
        try {
            const n = await db.collection(c).countDocuments({ source: { $in: MOI } });
            if (n > 0) {
                console.error(`DỪNG: ${c} đã có ${n} bản ghi mang source mới (${MOI.join(', ')}).`);
                console.error('       Đổi tiếp là GỘP hai bộ làm một, không tách lại được.');
                dungLai = true;
            }
        } catch { /* collection không tồn tại */ }
    }
    if (dungLai) { await mongoose.disconnect(); process.exit(1); }

    // ── Đếm trước khi đổi ──────────────────────────────────────────────────
    console.log('Sẽ đổi:');
    let tong = 0;
    for (const c of KHO_TU) {
        for (const cu of CU) {
            let n = 0;
            try { n = await db.collection(c).countDocuments({ source: cu }); } catch { continue; }
            if (n > 0) {
                console.log(`  ${c.padEnd(20)} source '${cu}' → '${DOI[cu]}'  (${n} bản ghi)`);
                tong += n;
            }
        }
    }

    // Bộ đề trỏ ngược về `source` — không đổi thì chúng mở ra 0 từ.
    const deLienQuan = await db.collection('vocabularies_topics')
        .find({ sourceKeys: { $in: CU } }).toArray();
    for (const d of deLienQuan) {
        console.log(`  ${'vocabularies_topics'.padEnd(20)} đề "${d.displayName}" sourceKeys ${JSON.stringify(d.sourceKeys)}`);
    }

    if (tong === 0 && deLienQuan.length === 0) {
        console.log('  (không có gì để đổi)');
        await mongoose.disconnect();
        return;
    }

    if (!that) {
        console.log(`\nTổng: ${tong} từ + ${deLienQuan.length} bộ đề.`);
        console.log('Chạy lại với --that để ghi thật.');
        await mongoose.disconnect();
        return;
    }

    // ── Ghi ────────────────────────────────────────────────────────────────
    console.log('\nĐang ghi...');
    for (const c of KHO_TU) {
        for (const cu of CU) {
            try {
                const r = await db.collection(c).updateMany(
                    { source: cu }, { $set: { source: DOI[cu] } }
                );
                if (r.modifiedCount) console.log(`  ${c}: ${r.modifiedCount} bản ghi '${cu}' → '${DOI[cu]}'`);
            } catch { /* collection không tồn tại */ }
        }
    }

    // `sourceKeys` là MẢNG — dùng toán tử vị trí `$[]` với điều kiện lọc để chỉ
    // đổi đúng phần tử khớp, giữ nguyên các phần tử khác trong cùng mảng.
    for (const cu of CU) {
        const r = await db.collection('vocabularies_topics').updateMany(
            { sourceKeys: cu },
            { $set: { 'sourceKeys.$[phanTu]': DOI[cu] } },
            { arrayFilters: [{ phanTu: cu }] }
        );
        if (r.modifiedCount) console.log(`  vocabularies_topics: ${r.modifiedCount} đề '${cu}' → '${DOI[cu]}'`);
    }

    // ── Kiểm SAU: còn sót không, và bộ đề có khớp lại không ────────────────
    console.log('\nKiểm lại:');
    for (const c of KHO_TU) {
        for (const cu of CU) {
            try {
                const con = await db.collection(c).countDocuments({ source: cu });
                if (con) console.log(`  CÒN SÓT ${c}: ${con} bản ghi '${cu}'`);
            } catch { /* bỏ qua */ }
        }
    }
    const sotDe = await db.collection('vocabularies_topics').countDocuments({ sourceKeys: { $in: CU } });
    if (sotDe) console.log(`  CÒN SÓT vocabularies_topics: ${sotDe} đề`);

    // Đối chiếu cuối: mỗi bộ đề phải đếm ra đúng số từ như trước khi đổi.
    for (const moi of MOI) {
        let n = 0;
        for (const c of KHO_TU) {
            try { n += await db.collection(c).countDocuments({ source: moi }); } catch { /* bỏ qua */ }
        }
        const de = await db.collection('vocabularies_topics').countDocuments({ sourceKeys: moi });
        console.log(`  '${moi}': ${n} từ · ${de} bộ đề trỏ tới`);
    }

    await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
