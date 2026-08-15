/**
 * Chọn chế độ luyện tập ("Tuần tự" / "Ngẫu nhiên 1 Part" / "Ngẫu nhiên tất cả")
 * trình bày như THANH TAB, giống `.topic-tabs` của popup Chọn đề.
 *
 * Chỗ hỏng IM LẶNG ở đây: kiểu của `.pmode-group` nằm ở HAI file. layout.css đặt
 * nó là flex (thanh tab), còn topicSelector.css từng ép `display: grid` +
 * `grid-template-columns: repeat(3, 1fr)` cho nó — selector đó cụ thể hơn
 * (`.part-selector-modal .pmode-group`) nên THẮNG. Sửa mỗi layout.css thì nhìn
 * vẫn ra ba ô lưới, và gạch chân tab đang chọn nằm sai chỗ.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const S = join(__dirname, '..', '..', '..', 'assets', 'styles');
const layout = readFileSync(join(S, 'layout.css'), 'utf8');
const topicCss = readFileSync(join(S, 'topicSelector.css'), 'utf8');
const src = readFileSync(join(__dirname, 'partSelector.js'), 'utf8');

/** Thân quy tắc đầu tiên khớp selector (đã bỏ comment để không đọc trúng lời văn). */
function rule(css, selector) {
    const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const re = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`);
    const m = clean.match(re);
    expect(m, `không tìm thấy quy tắc ${selector}`).toBeTruthy();
    return m[1];
}

describe('trình bày như thanh tab', () => {
    test('.pmode-group là flex + gạch dưới, không phải lưới thẻ', () => {
        const r = rule(layout, '.pmode-group');
        expect(r).toMatch(/display:\s*flex/);
        expect(r).toMatch(/border-bottom:\s*2px solid/);
        expect(r, 'vẫn còn lưới 3 cột của kiểu thẻ cũ').not.toMatch(/grid-template-columns/);
    });

    test('nút tab: nền trong suốt, không viền, không bo góc', () => {
        const r = rule(layout, '.pmode-btn');
        expect(r).toMatch(/background:\s*transparent/);
        expect(r).toMatch(/border:\s*none/);
        expect(r, 'còn bo góc kiểu thẻ').not.toMatch(/border-radius/);
        // `position: relative` là bắt buộc cho gạch chân `::after` bám đúng nút.
        expect(r).toMatch(/position:\s*relative/);
    });

    test('tab đang chọn: đổi màu chữ + gạch chân, không nền gradient', () => {
        const active = rule(layout, '.pmode-btn--active::after');
        expect(active).toMatch(/position:\s*absolute/);
        expect(active).toMatch(/bottom:\s*-2px/);   // đè lên đúng viền của group
        expect(active).toMatch(/height:\s*2px/);

        const clean = layout.replace(/\/\*[\s\S]*?\*\//g, '');
        expect(clean, 'còn nền gradient của kiểu thẻ cũ')
            .not.toMatch(/\.pmode-btn--active\s*\{[^}]*linear-gradient/);
    });

    test('topicSelector.css KHÔNG ép lại thành lưới', () => {
        // Đây là cái bẫy: selector ở file kia cụ thể hơn nên thắng layout.css.
        const r = rule(topicCss, '.part-selector-modal .pmode-group');
        expect(r, 'ép display:grid → thanh tab vỡ thành 3 ô').not.toMatch(/display:\s*grid/);
        expect(r).not.toMatch(/grid-template-columns/);
    });

    test('không còn bẻ tab bằng LƯỚI (kiểu thẻ cũ)', () => {
        const clean = topicCss.replace(/\/\*[\s\S]*?\*\//g, '');
        const m = clean.match(/\.part-selector-modal \.pmode-group\s*\{[^}]*grid-template-columns:\s*1fr/);
        expect(m, 'còn quy tắc lưới của kiểu thẻ cũ').toBeFalsy();
    });
});

describe('mobile: tab xếp DỌC như popup Chọn đề', () => {
    const clean = topicCss.replace(/\/\*[\s\S]*?\*\//g, '');
    const mobile = clean.slice(clean.indexOf('@media (max-width: 600px)'));

    test('xếp dọc, bỏ đường gạch dưới của cả thanh', () => {
        // Ba nhãn ("Ngẫu nhiên tất cả"…) nhồi ngang trên màn 380px thì cắt cụt.
        const m = mobile.match(/\.part-selector-modal \.pmode-group\s*\{([^}]*)\}/);
        expect(m, 'thiếu quy tắc xếp dọc cho mobile').toBeTruthy();
        expect(m[1]).toMatch(/flex-direction:\s*column/);
        expect(m[1]).toMatch(/border-bottom:\s*none/);
    });

    test('mỗi tab là một hộp viền tròn, full bề ngang', () => {
        const m = mobile.match(/\.part-selector-modal \.pmode-btn\s*\{([^}]*)\}/);
        expect(m, 'thiếu quy tắc hộp cho tab mobile').toBeTruthy();
        expect(m[1]).toMatch(/width:\s*100%/);
        expect(m[1]).toMatch(/border-radius:/);
    });

    test('tab đang chọn đổi sang viền+nền, gạch chân bị tắt', () => {
        // Xếp dọc thì gạch chân ngang không còn nghĩa gì.
        expect(mobile).toMatch(/\.part-selector-modal \.pmode-btn--active\s*\{[^}]*border-color/);
        expect(mobile).toMatch(/\.part-selector-modal \.pmode-btn--active::after\s*\{[^}]*display:\s*none/);
    });

    test('layout.css KHÔNG ẩn icon nữa (xếp dọc là có thừa chỗ)', () => {
        // Bản cũ ẩn icon vì lúc đó ba tab còn nhồi nằm ngang ở khổ ≤480px.
        const l = layout.replace(/\/\*[\s\S]*?\*\//g, '');
        const at480 = l.slice(l.indexOf('@media (max-width: 480px)'));
        expect(at480).not.toMatch(/\.pmode-btn i\s*\{[^}]*display:\s*none/);
    });
});

describe('thẻ Part: dải độ khó chỉ có MÀU, số từ vẫn hiện', () => {
    test('dải độ khó giữ nguyên 3 màu A/B/C', () => {
        expect(src).toMatch(/getLevelBar/);
        expect(src).toMatch(/#22c55e/);   // A — xanh
        expect(src).toMatch(/#f59e0b/);   // B — vàng
        expect(src).toMatch(/#ef4444/);   // C — đỏ
    });

    test('KHÔNG in chữ "A: 18 • B: 5" dưới dải nữa', () => {
        // Bản cũ dựng một hàng <span> nhãn màu bên dưới dải. Con số chỉ còn ở
        // `title` của từng đoạn.
        expect(src).not.toMatch(/<span style="color:#22c55e">A:/);
        expect(src).not.toMatch(/\.filter\(Boolean\)\.join\(' • '\)/);
        expect(src).toMatch(/title="A: \$\{a\} từ"/);
    });

    test('dải dùng class, không phải style inline như bản cũ', () => {
        // Kích thước/bo góc chuyển vào CSS thì mới ẩn được ở mobile bằng
        // một quy tắc; để inline `display:flex` thì `display:none` phải đấu với
        // inline và thua.
        expect(src).toMatch(/<div class="part-level-bar">/);
        expect(src).not.toMatch(/style="display:flex;height:5px/);
    });

    test('VẪN hiển thị số từ', () => {
        expect(src).toMatch(/\$\{this\.partCounts\[part\]\} từ/);
    });

    test('số từ dùng chung khuôn với popup "Chọn đề"', () => {
        // Cùng `.topic-meta > .word-count` + icon sách thì hai popup mới trông
        // như một; thẻ <p> tự chế như bản cũ là lệch cỡ chữ và lệch màu.
        expect(src).toMatch(/<div class="topic-meta">\s*<span class="word-count"><i class="fas fa-book"><\/i>/);
    });

    test('kiểu của .word-count là toàn cục — popup Part dùng được', () => {
        // Nếu ai đó bọc nó vào `.topic-selection-container` thì thẻ Part mất
        // kiểu và số từ hiện ra trần trụi, cỡ chữ khác hẳn.
        expect(topicCss).toMatch(/^\.word-count\s*\{/m);
        expect(topicCss).toMatch(/^\.topic-meta\s*\{/m);
    });

    test('vẫn giữ tên Part và dấu tích khi đang chọn', () => {
        expect(src).toMatch(/<h3 title="\$\{part\}">\$\{part\}<\/h3>/);
        expect(src).toMatch(/fa-check-circle/);
    });

    test('dải chỉ hiện ở DESKTOP — mobile ẩn đi', () => {
        // Màn hẹp thẻ nằm ngang, khối chữ ~200px: dải vừa mỏng vừa ngắn, mà con
        // số thì nằm trong `title` (điện thoại không rê chuột được).
        const clean = topicCss.replace(/\/\*[\s\S]*?\*\//g, '');
        const mobile = clean.slice(clean.indexOf('@media (max-width: 600px)'));
        expect(mobile).toMatch(/\.part-level-bar\s*\{[^}]*display:\s*none/);
    });

    test('kiểu của dải nằm ở CSS (để mobile ẩn được)', () => {
        expect(topicCss).toMatch(/^\.part-level-bar\s*\{/m);
        const r = topicCss.match(/^\.part-level-bar\s*\{([^}]*)\}/m)[1];
        expect(r).toMatch(/display:\s*flex/);
        expect(r).toMatch(/height:\s*5px/);
    });

    test('quy tắc dải KHÔNG bị bó vào riêng popup Part', () => {
        // Popup Chọn đề dùng chung class này. Bọc thành
        // `.part-selector-modal .part-level-bar` là bên Chọn đề mất kiểu (và
        // mất luôn việc ẩn ở mobile) mà nhìn lướt không thấy.
        expect(topicCss).not.toMatch(/\.part-selector-modal \.part-level-bar\s*\{/);
    });
});

describe('nút Tải lại — nghe ĐÚNG sự kiện', () => {
    test('nghe CẢ `vocab:loaded` lẫn `topic:changed`', () => {
        // Mỗi đường tải phát một sự kiện khác nhau:
        //   `vocab:loaded`  — chỉ gameLogic phát (kho CHUNG)
        //   `topic:changed` — topicSelector phát ở cả 4 nhánh (đề chung, bộ
        //                     riêng, bộ được chia sẻ, nhóm từ sai)
        // Chỉ nghe cái đầu là bộ từ RIÊNG bấm Tải lại sẽ không dựng lại lưới.
        expect(src).toMatch(/EventBus\.on\('vocab:loaded', onVocabLoaded\)/);
        expect(src).toMatch(/EventBus\.on\('topic:changed', onVocabLoaded\)/);
    });

    test('gỡ CẢ HAI listener khi đóng popup', () => {
        // Gỡ thiếu một cái thì mở lại lần hai có hai listener cùng chạy, cái cũ
        // trỏ vào DOM đã bị vứt.
        expect(src).toMatch(/this\._unsubVocab = \(\) => \{ offLoaded\?\.\(\); offChanged\?\.\(\); \}/);
    });

    test('`topic:changed` thật sự được phát ở nhánh bộ từ riêng', () => {
        // Nếu ai đó đổi tên sự kiện bên topicSelector thì test này đỏ, thay vì
        // để nút quay 10 giây rồi báo lỗi sai sự thật.
        const topicSel = readFileSync(
            join(__dirname, '..', 'topic', 'topicSelector.js'), 'utf8');
        const i = topicSel.indexOf('async selectPersonalTopic');
        expect(i).toBeGreaterThan(-1);
        expect(topicSel.slice(i, i + 900)).toMatch(/EventBus\.emit\('topic:changed'/);
    });

    test('vẫn có chốt chặn thời gian phòng khi không sự kiện nào tới', () => {
        expect(src).toMatch(/_refreshTimer = setTimeout/);
    });
});

describe('nút Đóng ở đáy popup Chọn Part', () => {
    test('có nút Đóng, dùng footer sẵn có của Modal', () => {
        // Trên điện thoại nút × góc trên phải nằm ngoài tầm ngón cái, mà popup
        // này dài phải cuộn.
        expect(src).toMatch(/buttons:\s*\[\{\s*text:\s*'Đóng'/);
    });

    test('bấm là đóng — dựa vào mặc định closeOnClick của Modal', () => {
        const i = src.indexOf("text: 'Đóng'");
        expect(src.slice(i, i + 120)).not.toMatch(/closeOnClick:\s*false/);
    });

    test('mobile: nút footer trải hết bề ngang', () => {
        const l = layout.replace(/\/\*[\s\S]*?\*\//g, '');
        const at480 = l.slice(l.indexOf('@media (max-width: 480px)'));
        expect(at480).toMatch(/\.modal-footer \.btn\s*\{[^}]*width:\s*100%/);
    });
});

describe('bỏ dòng giải thích thừa dưới mỗi nút', () => {
    test('không còn render <span class="pmode-sub">', () => {
        expect(src).not.toMatch(/class="pmode-sub"/);
    });

    test('giữ lời giải thích ở title cho ai cần rê chuột', () => {
        expect(src).toMatch(/title="\$\{m\.sub\}"/);
    });

    test('không để lại CSS mồ côi của .pmode-sub', () => {
        // Quy tắc trỏ vào class không còn ai dùng — đọc code sau này tưởng còn.
        expect(layout).not.toMatch(/\.pmode-sub\s*\{/);
        expect(topicCss).not.toMatch(/\.pmode-sub\s*\{/);
    });

    test('nhãn vẫn còn — đó mới là thứ phân biệt ba chế độ', () => {
        expect(src).toMatch(/class="pmode-label"/);
        for (const label of ['Tuần tự', 'Ngẫu nhiên 1 Part', 'Ngẫu nhiên tất cả']) {
            expect(src).toContain(label);
        }
    });
});
