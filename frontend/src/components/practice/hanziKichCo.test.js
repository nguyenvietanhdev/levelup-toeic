/**
 * Ô viết chữ Hán: MỘT kích cỡ duy nhất, và cả khối vừa khung hình.
 *
 * Hai lỗi tách bạch, cùng hậu quả là các nút tụt khỏi màn hình:
 *
 *   1. Ô đổi cỡ theo SỐ CHỮ — 260px với từ 1–2 chữ, 180px từ 3 chữ. Nghĩa là
 *      hai nút Trước/Tiếp và ba nút dưới cùng NHẢY CHỖ giữa hai câu, mắt phải
 *      tìm lại nút sau mỗi lần chuyển.
 *
 *   2. Cỡ 260px cộng nhịp dọc rộng đẩy ba nút dưới cùng xuống dưới mép màn
 *      hình — phải cuộn mới bấm được.
 *
 * Và một lỗi riêng lộ ra từ cùng màn hình: thanh tiêu đề in `hanzi-writing`,
 * tức MÃ chế độ, vì bảng nhãn thiếu đúng mục đó.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const F = (...p) => readFileSync(join(__dirname, ...p), 'utf8');
const css = F('..', '..', 'assets', 'styles', 'components.css');
const pm = F('practiceManager.js');
const review = F('modes', 'reviewMistakes.js');
const cfg = F('..', '..', 'game', 'config.js');

/** Thân quy tắc CSS đầu tiên khớp selector. */
const rule = (sel) => {
    // Neo vào ĐẦU DÒNG: `.hanzi-canvas {` trần còn khớp
    // `.hanzi-boxes .hanzi-canvas { flex: 0 0 auto; }` đứng trước trong file,
    // và test đi so trên thân của luật sai.
    const i = css.search(new RegExp(`^${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm'));
    expect(i, `không tìm thấy ${sel}`).toBeGreaterThan(-1);
    return css.slice(css.indexOf('{', i), css.indexOf('}', i));
};

describe('MỘT cỡ duy nhất, không đổi theo số chữ', () => {
    test('không còn luật thu nhỏ khi có từ 3 ô trở lên', () => {
        // Đây là thứ làm các nút nhảy chỗ giữa hai câu.
        expect(css).not.toMatch(/nth-child\(3\)\) \.hanzi-canvas/);
    });

    test('không còn cỡ riêng cho điện thoại', () => {
        // Ba con số ở ba nơi thì sửa một chỗ quên hai chỗ.
        expect(css).not.toMatch(/\.hanzi-canvas,?\s*[^{]*\{\s*width: 170px/);
    });

    test('cỡ khai MỘT lần, dùng cho cả hai chiều', () => {
        const r = rule('.hanzi-canvas {');
        expect(r).toMatch(/--o-chu:/);
        expect(r).toMatch(/width: var\(--o-chu\)/);
        expect(r).toMatch(/height: var\(--o-chu\)/);
    });

    test('không còn số cứng 260px', () => {
        const r = rule('.hanzi-canvas {');
        expect(r).not.toMatch(/width: 260px/);
    });
});

describe('cỡ co theo khung hình để các nút không bị đẩy', () => {
    const bieuThuc = () => {
        const r = rule('.hanzi-canvas {');
        const m = r.match(/--o-chu:\s*([^;]+);/);
        expect(m, 'không tìm thấy `--o-chu`').toBeTruthy();
        return m[1];
    };

    test('dùng `clamp` theo `vh`, không phải một số cứng', () => {
        // Số cứng thì màn thấp vẫn tràn, màn cao lại phí chỗ. Với MỘT cửa sổ
        // nhất định thì `clamp` cho một con số cố định — đúng điều cần: nút
        // không nhúc nhích giữa các câu.
        const b = bieuThuc();
        expect(b).toMatch(/clamp\(/);
        expect(b).toMatch(/vh/);
    });

    test('có chặn theo bề RỘNG nữa', () => {
        // Ô vuông rộng bằng chiều cao; 34vh trên máy dài có thể rộng hơn cả màn.
        expect(bieuThuc()).toMatch(/vw/);
    });

    test('trần không vượt 220px, sàn không dưới 140px', () => {
        // Trên 220 là đẩy nút xuống; dưới 140 thì nét chen nhau không tô nổi.
        const b = bieuThuc();
        expect(b).toMatch(/clamp\(140px/);
        expect(b).toMatch(/220px\)/);
    });

    test('nhịp dọc thu lại', () => {
        // Khoảng hở `md` ở ba chỗ cộng lại gần 64px — vừa đúng phần làm ba nút
        // dưới cùng tụt khỏi khung hình.
        const r = rule('.hanzi-mode {');
        expect(r).toMatch(/gap: var\(--spacing-sm\)/);
        expect(r).toMatch(/padding: var\(--spacing-sm\) 0/);
    });
});

describe('ô ở "Ôn từ sai" dùng CHUNG công thức', () => {
    test('CSS cùng một biểu thức', () => {
        // Cùng một widget, cùng một vấn đề; hai nơi hai con số là sửa chỗ này
        // quên chỗ kia.
        const r = rule('.rm-hanzi {');
        expect(r).toMatch(/clamp\(140px, min\(34vh, 60vw\), 220px\)/);
        expect(r).not.toMatch(/max-width: 260px/);
    });

    test('JS đọc bề rộng THẬT, không tự kẹp trần', () => {
        // CSS đã chặn ở 220; đặt thêm một trần trong JS là hai nơi phải sửa
        // song song.
        expect(review).toMatch(/Math\.max\(140, box\.clientWidth \|\| 200\)/);
        expect(review).not.toMatch(/Math\.min\(260, box\.clientWidth/);
    });
});

describe('bảng nhãn chế độ đủ mọi chế độ', () => {
    /** Tên chế độ khai trong `modeNames`. */
    const coNhan = (() => {
        const i = pm.indexOf('const modeNames = {');
        expect(i).toBeGreaterThan(-1);
        const blk = pm.slice(i, pm.indexOf('};', i));
        return new Set([...blk.matchAll(/'([a-z][a-z-]+)':/g)].map((m) => m[1]));
    })();

    /**
     * Mọi chế độ, lấy từ `Config.energyCosts`.
     *
     * Dùng bảng này chứ không phải `Config.modes`: `energyCosts` là bảng PHẲNG
     * (mã → số) nên đọc bằng regex là chính xác, còn `modes` lồng object và
     * regex đếm hụt mất `matching` — tức là test sẽ bỏ qua đúng chế độ nó tưởng
     * đang kiểm.
     */
    const moiCheDo = (() => {
        const i = cfg.indexOf('energyCosts: {');
        expect(i).toBeGreaterThan(-1);
        const blk = cfg.slice(i, cfg.indexOf('\n    },', i));
        return new Set([...blk.matchAll(/'([a-z][a-z-]+)':/g)].map((m) => m[1]));
    })();

    test('`hanzi-writing` có nhãn tiếng Việt', () => {
        // Thiếu thì `modeNames[mode] || mode` in ra MÃ chế độ ngay trên thanh
        // tiêu đề — trông như lỗi kỹ thuật lọt ra ngoài.
        expect(coNhan.has('hanzi-writing')).toBe(true);
        expect(pm).toMatch(/'hanzi-writing': 'Luyện viết chữ Hán'/);
    });

    test('KHÔNG chế độ nào thiếu nhãn', () => {
        // Chốt cả bảng, không riêng chế độ vừa sửa: thêm chế độ mới mà quên
        // nhãn thì lỗi này quay lại y hệt.
        const thieu = [...moiCheDo].filter((m) => !coNhan.has(m));
        expect(thieu, `thiếu nhãn: ${thieu.join(', ')}`).toEqual([]);
    });

    test('có ít nhất 17 chế độ để phép so trên có nghĩa', () => {
        // `moiCheDo` rỗng thì test trên luôn xanh mà không kiểm gì.
        expect(moiCheDo.size).toBeGreaterThanOrEqual(17);
    });
});

describe('chữ không được TRÀN ra ngoài ô', () => {
    const hz = F('modes', 'hanziWriting.js');

    test('KHÔNG bịa số khi đo trượt', () => {
        // Bản cũ rơi về `|| 260` — con số của luật CSS đã bỏ, nên SVG được vẽ
        // to hơn ô và chữ tràn ra ngoài khung. Trông như dữ liệu nét hỏng, mà
        // thật ra chỉ là một phép đo trượt.
        expect(hz).not.toMatch(/getBoundingClientRect\(\)\.width\) \|\| 260/);
        expect(hz).toMatch(/const size = this\.doCo\(target\);/);
    });

    test('đo trượt thì ĐỢI khung hình sau, không vẽ', () => {
        const i = hz.indexOf('const size = this.doCo(target);');
        const khoi = hz.slice(i, i + 900);
        expect(khoi).toMatch(/if \(!size\) \{/);
        expect(khoi).toMatch(/requestAnimationFrame/);
        // Và phải THOÁT, không chạy tiếp với `size` rỗng.
        expect(khoi).toMatch(/return;/);
    });

    test('lần thử lại bỏ qua nếu đã sang câu khác', () => {
        // Người dùng bấm Tiếp trong lúc chờ khung hình sau thì vẽ chữ của câu cũ.
        const i = hz.indexOf('requestAnimationFrame');
        expect(hz.slice(i, i + 220))
            .toMatch(/this\.questions\[this\.currentIndex\] === q/);
    });

    test('vẽ lại khi ô ĐỔI CỠ', () => {
        // HanziWriter nhận kích thước lúc tạo rồi không đọc lại. Cỡ ô nay tính
        // theo `vh`, nên xoay máy hay kéo cửa sổ là ô co lại mà SVG giữ nguyên.
        expect(hz).toMatch(/new ResizeObserver\(/);
        // Chốt LỜI GỌI, không phải khai báo: `/theoDoiCo\(target, q\)/` trần còn
        // khớp chính dòng `theoDoiCo(target, q) {` nên gỡ lời gọi đi vẫn xanh.
        expect(hz).toMatch(/this\.theoDoiCo\(target, q\);/);
    });

    test('chặn vòng lặp vẽ lại', () => {
        // `vh` cho số lẻ, nên chính việc vẽ lại cũng làm rect lệch vài phần
        // trăm pixel — không chặn thì quan sát → vẽ → quan sát mãi.
        const i = hz.indexOf('new ResizeObserver(');
        expect(hz.slice(i, i + 700)).toMatch(/Math\.abs\(moi - this\._coCu\) < 4/);
    });

    test('ngừng theo dõi khi rời chế độ', () => {
        // `ResizeObserver` sống tiếp là giữ tham chiếu tới DOM đã gỡ.
        const i = hz.indexOf('cleanup() {');
        expect(hz.slice(i, i + 300)).toMatch(/this\.thoiTheoDoiCo\(\)/);
    });

    test('CSS có lưới an toàn cắt phần tràn', () => {
        // Lớp chặn cuối: SVG lỡ to hơn ô thì tệ nhất cũng chỉ bị xén trong ô,
        // không phá bố cục xung quanh.
        expect(rule('.hanzi-canvas {')).toMatch(/overflow: hidden/);
        expect(css).toMatch(/\.hanzi-canvas > svg/);
    });
});
