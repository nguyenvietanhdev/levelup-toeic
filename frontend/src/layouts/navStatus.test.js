/**
 * Thanh trạng thái phải nói ĐÚNG thứ người dùng đang luyện.
 *
 * Hai lỗi cùng một gốc: giá trị đọc MỘT LẦN lúc gắn vào cây, mà lúc đó
 * `GameState` thường chưa nạp xong hồ sơ server.
 *
 *   1. Ô ngôn ngữ đứng nguyên ở 'en'. Đang luyện tiếng Trung mà nav vẫn hiện
 *      "Tiếng Anh" — bấm vào là đổi nhầm sang tiếng Anh thật.
 *
 *   2. Badge Part không hiện. Thẻ này do React render với `display:none` sẵn
 *      trong JSX, còn `PartSelector.updatePartBadge()` lại đặt tay
 *      `style.display` — React render lại là ghi đè về `none`. Lúc khởi động
 *      thì hàm đó còn chạy TRƯỚC khi StatusBar kịp gắn vào cây.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const statusBar = readFileSync(join(__dirname, 'StatusBar.jsx'), 'utf8');
const quick = readFileSync(join(__dirname, 'QuickSettings.jsx'), 'utf8');
const partSel = readFileSync(
    join(__dirname, '..', 'components', 'vocab', 'part', 'partSelector.js'), 'utf8');

/** Thân của `sync` trong QuickSettings — cắt tới lệnh `sync();` gọi nó. */
const syncBody = (() => {
    const i = quick.indexOf('const sync = () =>');
    expect(i).toBeGreaterThan(-1);
    const j = quick.indexOf('sync();', i);
    expect(j).toBeGreaterThan(i);
    return quick.slice(i, j);
})();

/** Thân một hàm của object literal, cắt từ ĐỊNH NGHĨA tới `\n    },`. */
function method(src, name) {
    // Anchor phải là dòng định nghĩa (thụt 4 dấu cách), không phải chỗ GỌI —
    // `indexOf('ten()')` bắt trúng lời gọi nằm trước đó thì cắt ra nhầm hàm.
    const i = src.indexOf(`\n    ${name}() {`);
    expect(i, `không tìm thấy định nghĩa ${name}()`).toBeGreaterThan(-1);
    const j = src.indexOf('\n    },', i);
    expect(j).toBeGreaterThan(i);
    return src.slice(i, j);
}

describe('ô ngôn ngữ theo kịp hồ sơ server', () => {
    test('sync() đọc lại vocabLang, không chỉ difficulty', () => {
        expect(syncBody).toMatch(/setVocabLang\(/);
    });

    test('nghe GAME_INITIALIZED — lúc hồ sơ nạp xong', () => {
        // `useState` chỉ chạy lúc gắn vào cây; không nghe sự kiện này thì ô
        // ngôn ngữ chốt 'en' rồi giữ mãi.
        expect(quick).toMatch(/EventBus\.on\(GameEvents\.GAME_INITIALIZED, sync\)/);
    });

    test('gỡ CẢ HAI lượt đăng ký khi rời cây', () => {
        // Sót một cái là component đã tháo vẫn bị gọi setState.
        expect(quick).toMatch(/return \(\) => \{ unsub\?\.\(\); unsubInit\?\.\(\); \}/);
    });

    test('chỉ nhận en/zh, không nhận giá trị lạ', () => {
        expect(syncBody).toMatch(/s\.vocabLang === 'en' \|\| s\.vocabLang === 'zh'/);
    });
});

describe('badge Part do React giữ', () => {
    test('hiện theo state, không phải style.display', () => {
        expect(statusBar).toMatch(/\{selectedPart && \(/);
        expect(statusBar).not.toMatch(/id="part-badge"[^>]*style=\{\{ display: 'none' \}\}/);
    });

    test('tên Part lấy từ state', () => {
        expect(statusBar).toMatch(/<span id="part-badge-text">\{selectedPart\}<\/span>/);
    });

    test('đọc lại mỗi lần refresh, không chỉ lúc gắn cây', () => {
        const i = statusBar.indexOf('const refreshSessionLabel');
        const body = statusBar.slice(i, i + 300);
        expect(body).toMatch(/setSelectedPart\(/);
    });

    test('đã nghe sẵn GAME_INITIALIZED và SESSION_BADGE_UPDATED', () => {
        expect(statusBar).toMatch(/GameEvents\.SESSION_BADGE_UPDATED, refreshSessionLabel/);
        expect(statusBar).toMatch(/GameEvents\.GAME_INITIALIZED, refreshSessionLabel/);
    });

    test('updatePartBadge KHÔNG còn sờ vào DOM', () => {
        // Còn `style.display` là còn đánh nhau với React.
        //
        // Bỏ COMMENT trước khi dò: lời chú thích trong hàm có nhắc `style.display`
        // để giải thích vì sao KHÔNG dùng nó — dò thẳng là đọc trúng chính lời
        // văn của mình và test đỏ oan.
        const body = method(partSel, 'updatePartBadge')
            .split('\n')
            .filter((l) => !/^\s*\/\//.test(l))
            .join('\n');
        expect(body).not.toMatch(/getElementById/);
        expect(body).not.toMatch(/style\.display/);
    });

    test('vẫn phát sự kiện để React biết mà đọc lại', () => {
        expect(method(partSel, 'updatePartBadge')).toMatch(/this\.updateSessionBadge\(\)/);
    });

    test('updateSessionBadge đồng bộ selectedPart vào settings', () => {
        // React đọc từ `settings.selectedPart`; thiếu dòng này là badge không
        // bao giờ hiện dù đã chọn Part.
        const body = method(partSel, 'updateSessionBadge');
        expect(body).toMatch(/s\.selectedPart = this\.selectedPart \|\| null/);
        expect(body).toMatch(/EventBus\.emit\(GameEvents\.SESSION_BADGE_UPDATED\)/);
    });
});

describe('nút × xoá Part', () => {
    test('có handler thật — trước đây là nút chết', () => {
        // Thẻ có `id="clear-part-btn"` nhưng KHÔNG chỗ nào gắn listener, mà
        // badge lại `display:none` lúc gắn cây nên không ai phát hiện.
        expect(statusBar).toMatch(/onClick=\{handleClearPart\}/);
        expect(statusBar).toMatch(/const handleClearPart = useCallback/);
    });

    test('gọi PartSelector.clearPart()', () => {
        const i = statusBar.indexOf('const handleClearPart');
        const body = statusBar.slice(i, i + 400);
        expect(body).toMatch(/PartSelector\.clearPart\(\)/);
    });

    test('nạp động — không kéo cụm chọn đề vào chunk khởi động', () => {
        const i = statusBar.indexOf('const handleClearPart');
        const body = statusBar.slice(i, i + 400);
        expect(body).toMatch(/await import\(/);
        expect(statusBar).not.toMatch(/^import \{ PartSelector \}/m);
    });
});
