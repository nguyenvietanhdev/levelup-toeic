/**
 * Nút "Tải lại" ở header hai popup chọn đề / chọn Part.
 *
 * Ba chỗ hỏng IM LẶNG mà test này giữ:
 *
 *   1. `loadShared()` có ĐỆM — thấy danh sách đã có thì return sớm. Nút gọi nó
 *      không kèm `force` thì bấm bao nhiêu lần cũng chỉ set lại đúng mảng cũ:
 *      không request, không đổi gì, người dùng tưởng nút hỏng.
 *
 *   2. Popup Part chỉ PHÁT `vocab:reload-requested` rồi đợi `vocab:loaded` để
 *      tắt spinner. Nhưng `vocab:loaded` chỉ phát khi tải THÀNH CÔNG — nguồn
 *      lỗi mạng hay rỗng thì không có sự kiện nào, nút quay mãi không dừng.
 *
 *   3. Cả ô tìm và nút tải lại đều `insertBefore(..., closeBtn)`, nên THỨ TỰ
 *      GỌI quyết định thứ tự hiển thị. Gọi ngược là nút nằm nhầm chỗ.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const topicModal = readFileSync(join(__dirname, 'topic', 'TopicModal.jsx'), 'utf8');
const useTopics = readFileSync(join(__dirname, 'topic', 'useTopics.js'), 'utf8');
const partSel = readFileSync(join(__dirname, 'part', 'partSelector.js'), 'utf8');

const layoutCss = readFileSync(
    join(__dirname, '..', '..', 'assets', 'styles', 'layout.css'), 'utf8');

describe('popup "Chọn đề luyện tập"', () => {
    test('có nút tải lại, đứng NGAY TRƯỚC nút đóng', () => {
        expect(topicModal).toMatch(/modal-header-refresh/);
        expect(topicModal.indexOf('modal-header-refresh'))
            .toBeLessThan(topicModal.indexOf('modal-close-btn'));
    });

    test('nút tải lại SÁT nút đóng, không lơ lửng giữa header', () => {
        // `.modal-header` là `justify-content: space-between` mà ô tìm bị chặn
        // `max-width: 320px` → không lấp hết chỗ trống. Thiếu `margin-left: auto`
        // thì 4 phần tử bị dàn đều và nút tải lại trôi ra giữa header.
        const r = layoutCss.match(/\.modal-header-refresh\s*\{([^}]*)\}/);
        expect(r, 'không tìm thấy quy tắc nút tải lại').toBeTruthy();
        expect(r[1], 'thiếu margin-left:auto → nút lơ lửng').toMatch(/margin-left:\s*auto/);
    });

    test('header vẫn là space-between (quy tắc trên mới có nghĩa)', () => {
        // Nếu ai đó đổi header sang `justify-content: flex-end` thì
        // `margin-left: auto` thành thừa — test này để biết mà dọn.
        const h = layoutCss.match(/\.modal-header\s*\{([^}]*)\}/);
        expect(h[1]).toMatch(/justify-content:\s*space-between/);
    });

    test('bỏ qua đệm khi bấm tải lại', () => {
        // Không có `true` thì `loadShared` thấy đệm còn hàng là return luôn.
        expect(topicModal).toMatch(/loadShared\(true\)/);
        expect(useTopics).toMatch(/loadShared = useCallback\(async \(force = false\)/);
        expect(useTopics).toMatch(/if \(!force && TopicSelector\.getAvailableTopics\(\)/);
    });

    test('mở popup thì KHÔNG force — có sẵn thì hiện ngay', () => {
        // `loadShared()` trong useEffect phải để trống tham số, không thì lần nào
        // mở popup cũng bắt chờ mạng dù dữ liệu đã nằm sẵn.
        expect(topicModal).toMatch(/^\s*loadShared\(\);\s*$/m);
    });

    test('tải lại ĐÚNG tab đang mở', () => {
        expect(topicModal).toMatch(/tab === "personal"\) await loadPersonal\(\)/);
        expect(topicModal).toMatch(/else await loadWrong\(\)/);
    });

    test('spinner lấy từ cờ của useTopics, không nuôi state riêng', () => {
        // Hai nguồn sự thật thì có lúc nút quay mãi hoặc dừng trước khi xong.
        expect(topicModal).toMatch(/tab === "shared" \? loadingShared/);
        expect(topicModal).not.toMatch(/useState\([^)]*\)\s*;\s*\/\/ refreshing/);
    });

    test('đang tải thì chặn bấm tiếp', () => {
        expect(topicModal).toMatch(/disabled=\{refreshing\}/);
        expect(topicModal).toMatch(/if \(refreshing\) return;/);
    });
});

describe('popup "Chọn Part để luyện tập"', () => {
    test('có nút tải lại chèn trước nút đóng', () => {
        expect(partSel).toMatch(/id = 'part-refresh-btn'/);
        expect(partSel).toMatch(/header\.insertBefore\(btn, closeBtn\)/);
    });

    test('ô tìm chèn TRƯỚC nút tải lại → thứ tự "tìm · tải lại · đóng"', () => {
        // Cả hai cùng `insertBefore(closeBtn)` nên cái gọi sau nằm sát nút đóng.
        const m = partSel.match(/setupHeaderSearch\(\);\s*setupHeaderRefresh\(\)/);
        expect(m, 'gọi sai thứ tự → nút tải lại nằm nhầm chỗ').toBeTruthy();
    });

    test('chỉ PHÁT yêu cầu, không tự gọi API', () => {
        // File này không biết nguồn đang chọn đi đường API nào; import ngược
        // topicSelector là vòng phụ thuộc.
        const i = partSel.indexOf("id = 'part-refresh-btn'");
        const block = partSel.slice(i, i + 900);
        expect(block).toMatch(/EventBus\.emit\('vocab:reload-requested'\)/);
        expect(block).not.toMatch(/loadVocabularyBySource/);
    });

    test('có chốt chặn thời gian để nút không quay mãi', () => {
        // `vocab:loaded` chỉ phát khi tải thành công — lỗi mạng/rỗng thì im.
        expect(partSel).toMatch(/_refreshTimer = setTimeout/);
        expect(partSel).toMatch(/Không tải lại được/);
    });

    test('tải xong thì tắt spinner', () => {
        expect(partSel).toMatch(/setRefreshing\(false\)/);
    });

    test('đóng popup thì huỷ chốt chặn', () => {
        // Không huỷ thì 10 giây sau vẫn nhảy thông báo lỗi cho popup đã đóng.
        const i = partSel.indexOf('onClose: () =>');
        expect(partSel.slice(i, i + 400)).toMatch(/clearTimeout\(_refreshTimer\)/);
    });

    test('_refreshTimer khai báo TRƯỚC Modal.show', () => {
        // `onClose` và `onVocabLoaded` đều đụng tới nó.
        expect(partSel.indexOf('let _refreshTimer'))
            .toBeLessThan(partSel.indexOf('Modal.show({'));
    });

    test('chưa chọn đề thì nói rõ, không quay vô nghĩa', () => {
        expect(partSel).toMatch(/Chưa chọn đề — không có gì để tải lại/);
    });
});
