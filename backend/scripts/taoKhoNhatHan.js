/**
 * Dựng file JSON kho từ vựng chung tiếng Nhật (JLPT N5–N1) và tiếng Hàn (sơ / trung / cao cấp)
 * từ hai bộ dữ liệu mở, đúng định dạng nhập JSON của trang admin (tab Tiếng Nhật / Tiếng Hàn).
 * KHÔNG ghi gì vào DB: admin tự nhập file sinh ra.
 *
 * Nguồn (phải ghi khi dùng):
 *   · JLPT: danh sách từ vựng của Jonathan Waller, https://www.tanos.co.uk/jlpt/ — Creative Commons
 *     "BY". Bản CSV đã làm sạch: https://github.com/Bluskyo/JLPT_Vocabulary (MIT) —
 *     data/vocab/results/JLPT_vocab_ALL.csv (cột Kanji, Reading, Level).
 *   · Tiếng Hàn: 국립국어원 (Viện Quốc ngữ Quốc gia Hàn Quốc), 「한국어 학습용 어휘 목록」 (2003),
 *     https://www.korean.go.kr — file text (cp949), cột 순위, 단어, 품사, 풀이, 등급 (A/B/C).
 *
 * Hai bộ đều KHÔNG có nghĩa tiếng Việt: `vn` để trống, điền ở bước riêng (`--dich`, gọi AI).
 *
 * Dùng:  node scripts/taoKhoNhatHan.js --jlpt <JLPT_vocab_ALL.csv> --nikl <file.txt> --ra <thư mục>
 */
const fs = require('fs');
const path = require('path');

/** Mỗi file tối đa chừng này từ — dưới trần nhập một lần của admin (MAX_BULK_IMPORT = 2000). */
const MOI_FILE = 1500;

/** Đọc CSV đơn giản (không có dấu phẩy trong ô — đúng với bộ JLPT này). */
function docCsv(noiDung) {
    const dong = noiDung.replace(/^﻿/, '').split(/\r?\n/).filter((d) => d.trim());
    const dau = dong.shift().split(',').map((x) => x.trim());
    return dong.map((d) => {
        const o = d.split(',');
        return Object.fromEntries(dau.map((k, i) => [k, (o[i] || '').trim()]));
    });
}

/**
 * Bản ghi JLPT → từ của kho tiếng Nhật (thuần). Mặt chữ là Kanji (nếu có), cách đọc hiragana vào
 * `phonetic`. Cấp N5…N1 vừa là `level` (thang JLPT trong sổ ngôn ngữ) vừa là Part để luyện theo cấp.
 */
function tuJlpt(r) {
    const doc = r.Reading || '';
    const ja = r.Kanji || doc;
    const cap = Number(r.Level);
    if (!ja || !(cap >= 1 && cap <= 5)) return null;
    const level = `N${cap}`;
    return { ja, vn: '', phonetic: doc && doc !== ja ? doc : '', part: level, level, type: '', source: 'jlpt' };
}

/** Từ loại của danh sách Viện Quốc ngữ → loại từ của kho. */
const TU_LOAI_KO = {
    명: 'noun', 의: 'noun', 대: 'pronoun', 수: 'number', 동: 'verb', 형: 'adjective', 보: 'verb',
    부: 'adverb', 관: 'determiner', 감: 'interjection', 조: 'particle',
};
const NHOM_KO = { A: 'Sơ cấp', B: 'Trung cấp', C: 'Cao cấp' };

/**
 * Một dòng của danh sách tiếng Hàn → từ của kho (thuần). Bỏ số đánh dấu từ đồng âm ("가격03" →
 * "가격"); chữ Hán gốc (풀이, vd 價格) giữ ở `synonyms` để phân biệt từ đồng âm khi dịch nghĩa.
 */
function tuNikl(dong) {
    const [, tu, loai, giai, bac] = dong.split('\t').map((x) => (x || '').trim());
    const ko = (tu || '').replace(/\d+$/, '');
    if (!ko || !NHOM_KO[bac]) return null;
    const loaiDau = (loai || '').split(/[·,\s]/)[0];
    return {
        ko, vn: '', phonetic: '', part: NHOM_KO[bac], level: bac,
        type: TU_LOAI_KO[loaiDau] || '', synonyms: giai || '', source: 'nikl',
    };
}

/** Bỏ trùng theo (mặt chữ, gốc Hán, Part): danh sách nguồn có vài dòng lặp. */
function boTrung(ds, truong) {
    const da = new Set();
    return ds.filter((t) => {
        const k = `${t[truong]}|${t.synonyms || ''}|${t.part}`;
        if (da.has(k)) return false;
        da.add(k);
        return true;
    });
}

function ghiTheoNhom(ds, ra, tienTo) {
    const theoPart = new Map();
    for (const t of ds) theoPart.set(t.part, [...(theoPart.get(t.part) || []), t]);
    const files = [];
    for (const [part, tu] of theoPart) {
        for (let i = 0; i < tu.length; i += MOI_FILE) {
            const ten = `${tienTo}-${part.replace(/\s+/g, '-').toLowerCase()}-${i / MOI_FILE + 1}.json`;
            fs.writeFileSync(path.join(ra, ten), JSON.stringify(tu.slice(i, i + MOI_FILE), null, 1));
            files.push({ ten, so: Math.min(MOI_FILE, tu.length - i) });
        }
    }
    return files;
}

function main(argv) {
    const lay = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : ''; };
    const ra = lay('--ra');
    if (!ra) throw new Error('Thiếu --ra <thư mục>');
    fs.mkdirSync(ra, { recursive: true });
    const ketQua = [];
    if (lay('--jlpt')) {
        const ds = boTrung(docCsv(fs.readFileSync(lay('--jlpt'), 'utf8')).map(tuJlpt).filter(Boolean), 'ja');
        ketQua.push(...ghiTheoNhom(ds, ra, 'ja'));
    }
    if (lay('--nikl')) {
        // File gốc của Viện mã cp949: đổi sang UTF-8 trước (vd Python: open(f,'rb').read().decode('cp949')).
        const chu = fs.readFileSync(lay('--nikl'), 'utf8');
        if (!/[가-힣]/.test(chu)) throw new Error('File tiếng Hàn chưa ở dạng UTF-8 (file gốc mã cp949): đổi mã trước khi chạy.');
        const dong = chu.split(/\r?\n/).slice(1).filter((d) => d.includes('\t'));
        const ds = boTrung(dong.map(tuNikl).filter(Boolean), 'ko');
        ketQua.push(...ghiTheoNhom(ds, ra, 'ko'));
    }
    return ketQua;
}

if (require.main === module) {
    const files = main(process.argv.slice(2));
    for (const f of files) console.log(`${f.ten}\t${f.so} từ`);
    console.log(`Tổng: ${files.reduce((s, f) => s + f.so, 0)} từ trong ${files.length} file.`);
}

module.exports = { docCsv, tuJlpt, tuNikl, boTrung, main };
