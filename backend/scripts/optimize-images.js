/**
 * Nén + resize ảnh trong public/uploads (giảm dung lượng, giữ nguyên tên/đường dẫn).
 *
 *   node scripts/optimize-images.js                 # nén public/uploads, max 512px
 *   node scripts/optimize-images.js --max=256       # đổi cạnh tối đa
 *   node scripts/optimize-images.js --dir=public/uploads/avatar
 *   node scripts/optimize-images.js --dry           # chỉ xem, không ghi đè
 *
 * - Chỉ THU NHỎ (không phóng to). Giữ định dạng (png/jpg/webp), strip metadata.
 * - Ghi ra file tạm rồi thay thế; chỉ thay khi file mới NHẸ HƠN (không làm phình).
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const args = process.argv.slice(2);
const getArg = (k, d) => {
    const a = args.find(x => x.startsWith(`--${k}=`));
    return a ? a.split('=')[1] : d;
};
const MAX = parseInt(getArg('max', '512'), 10) || 512;
const DIR = path.resolve(__dirname, '..', getArg('dir', 'public/uploads'));
const DRY = args.includes('--dry');
const EXT = /\.(png|jpe?g|webp)$/i;

const fmtKB = (n) => `${(n / 1024).toFixed(0)} KB`;

function walk(dir) {
    let out = [];
    if (!fs.existsSync(dir)) return out;
    for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        const st = fs.statSync(p);
        if (st.isDirectory()) out = out.concat(walk(p));
        else if (EXT.test(name)) out.push(p);
    }
    return out;
}

async function optimize(file) {
    const before = fs.statSync(file).size;
    const ext = path.extname(file).toLowerCase();
    let img = sharp(file, { failOn: 'none' }).rotate(); // auto-orient theo EXIF
    const meta = await img.metadata();

    if ((meta.width || 0) > MAX || (meta.height || 0) > MAX) {
        img = img.resize({ width: MAX, height: MAX, fit: 'inside', withoutEnlargement: true });
    }
    if (ext === '.png') img = img.png({ compressionLevel: 9, palette: true, quality: 82 });
    else if (ext === '.webp') img = img.webp({ quality: 82 });
    else img = img.jpeg({ quality: 82, mozjpeg: true });

    const buf = await img.toBuffer();
    const after = buf.length;
    const saved = before - after;

    if (saved <= 0) return { file, before, after: before, skipped: true };
    if (!DRY) {
        const tmp = file + '.tmp';
        fs.writeFileSync(tmp, buf);
        fs.renameSync(tmp, file);
    }
    return { file, before, after, skipped: false };
}

(async () => {
    const files = walk(DIR);
    if (!files.length) { console.log(`Không tìm thấy ảnh trong ${DIR}`); return; }
    console.log(`${DRY ? '[DRY] ' : ''}Nén ${files.length} ảnh · cạnh tối đa ${MAX}px · ${DIR}\n`);
    let totalBefore = 0, totalAfter = 0, changed = 0;
    for (const f of files) {
        try {
            const r = await optimize(f);
            totalBefore += r.before; totalAfter += r.after;
            const rel = path.relative(DIR, f);
            if (r.skipped) console.log(`  ⊙ ${rel}  ${fmtKB(r.before)} (đã tối ưu, bỏ qua)`);
            else { changed++; console.log(`  ✓ ${rel}  ${fmtKB(r.before)} → ${fmtKB(r.after)}  (-${Math.round((1 - r.after / r.before) * 100)}%)`); }
        } catch (e) { console.log(`  ✗ ${path.relative(DIR, f)}  LỖI: ${e.message}`); }
    }
    console.log(`\n${DRY ? '[DRY] ' : ''}Xong: ${changed}/${files.length} ảnh nén · tổng ${fmtKB(totalBefore)} → ${fmtKB(totalAfter)} (-${Math.round((1 - totalAfter / totalBefore) * 100)}%)`);
})().catch(e => { console.error(e); process.exit(1); });
