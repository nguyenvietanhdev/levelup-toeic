/**
 * Đang chọn nhóm TỪ SAI thì 16 chế độ kia tạm dừng.
 *
 * Nhóm từ sai là danh sách LỖI, không phải một bộ từ vựng. Mọi chế độ khác lấy
 * câu từ kho từ vựng, nên chạy trên nhóm này là vô nghĩa — mà trước đây vẫn bấm
 * vào được, và người dùng chỉ phát hiện khi đã vào tới bài (đã trừ năng lượng).
 *
 * Chặn kèm LỐI RA rõ ràng, không chỉ báo lỗi: đây là trạng thái người dùng tự
 * gỡ được ngay, khác hẳn khoá theo Level phải cày mới tới.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const home = readFileSync(join(__dirname, 'HomeScreen.jsx'), 'utf8');
const pm = readFileSync(
    join(__dirname, '..', 'practice', 'practiceManager.js'), 'utf8');

/** Thân `handleModeClick`. */
const thanClick = (() => {
    const i = home.indexOf('const handleModeClick');
    expect(i).toBeGreaterThan(-1);
    return home.slice(i, home.indexOf('\n    };', i));
})();

describe('nhận ra trạng thái đang ôn từ sai', () => {
    test('soi tiền tố `wrong:` của đề đang chọn', () => {
        // Đó là cách `TopicSelector` đánh dấu nhóm từ sai (`wrong:<source>`).
        expect(home).toMatch(/startsWith\('wrong:'\)/);
    });

    test('giữ trong state, không đọc thẳng `TopicSelector` lúc vẽ', () => {
        // Đọc thẳng thì React không biết để vẽ lại, và thẻ vẫn sáng sau khi
        // người dùng vừa chọn đề từ sai.
        expect(home).toMatch(/const \[khoaTuSai, setKhoaTuSai\] = useState\(/);
    });

    test('nghe `topic:changed` để cập nhật', () => {
        // Chọn đề xong mà không cập nhật thì phải F5 mới thấy thẻ bị khoá.
        expect(home).toMatch(/EventBus\.on\('topic:changed', doi\)/);
        expect(home).toMatch(/EventBus\.off\('topic:changed', doi\)/);
    });

    test('gỡ listener khi rời màn', () => {
        // Không gỡ thì mỗi lần vào Trang chủ cộng thêm một listener.
        const i = home.indexOf("EventBus.on('topic:changed'");
        expect(home.slice(i, i + 160)).toMatch(/return \(\) => EventBus\.off/);
    });
});

describe('chặn ở luồng BẤM', () => {
    test('chặn khi đang ôn từ sai', () => {
        expect(thanClick).toMatch(/if \(khoaTuSai && mode !== 'review-mistakes'\)/);
    });

    test('"Ôn lại từ sai" KHÔNG bị chặn', () => {
        // Đó là chế độ duy nhất chạy được trên nhóm này — chặn nó là kẹt cứng,
        // không vào được bài mà cũng không thoát ra được.
        expect(thanClick).toMatch(/mode !== 'review-mistakes'/);
    });

    test('THOÁT khỏi hàm, không chạy tiếp các bước sau', () => {
        const i = thanClick.indexOf("if (khoaTuSai && mode !== 'review-mistakes')");
        const khoi = thanClick.slice(i, thanClick.indexOf('// Khoá theo Level', i));
        expect(khoi).toMatch(/return;/);
    });

    test('chặn TRƯỚC bước trừ năng lượng', () => {
        // Để sau thì người dùng mất năng lượng rồi mới được hỏi.
        const iChan = thanClick.indexOf('khoaTuSai && mode');
        const iEnergy = thanClick.indexOf('energyCost');
        expect(iChan).toBeGreaterThan(-1);
        if (iEnergy > -1) expect(iChan).toBeLessThan(iEnergy);
    });
});

describe('popup hai lựa chọn', () => {
    const iPopup = thanClick.indexOf('Modal.show(');
    const popup = thanClick.slice(iPopup, thanClick.indexOf('return;', iPopup));

    test('nói rõ đang vướng gì', () => {
        expect(popup).toMatch(/Đang ở chế độ luyện từ vựng sai/);
        expect(popup).toMatch(/nhóm từ sai/);
    });

    test('đúng HAI nút', () => {
        expect(popup).toMatch(/text: 'Giữ nguyên'/);
        expect(popup).toMatch(/text: 'Thoát'/);
    });

    test('"Thoát" bỏ chọn nhóm từ sai', () => {
        const i = popup.indexOf("text: 'Thoát'");
        const khoi = popup.slice(i, i + 700);
        expect(khoi).toMatch(/PracticeManager\.xoaLuaChonTuSai\(\)/);
    });

    test('"Thoát" cập nhật state ngay, không đợi sự kiện', () => {
        // `xoaLuaChonTuSai` gọi `setCurrentTopic(null)` — hàm đó KHÔNG phát
        // `topic:changed`, nên không tự cập nhật là thẻ vẫn khoá sau khi thoát.
        const i = popup.indexOf("text: 'Thoát'");
        expect(popup.slice(i, i + 700)).toMatch(/setKhoaTuSai\(false\)/);
    });

    test('"Thoát" mở lại popup chọn đề, KÈM `pendingMode`', () => {
        // Không kèm thì chọn đề xong người dùng phải bấm lại chế độ lần nữa.
        const i = popup.indexOf("text: 'Thoát'");
        expect(popup.slice(i, i + 700))
            .toMatch(/TOPIC_MODAL_REQUESTED, \{ pendingMode: mode \}/);
    });

    test('"Giữ nguyên" mở popup chọn Part', () => {
        const i = popup.indexOf("text: 'Giữ nguyên'");
        expect(popup.slice(i, i + 300)).toMatch(/PartSelector\.showPartSelectionModal\(\)/);
    });

    test('"Giữ nguyên" KHÔNG bỏ chọn nhóm từ sai', () => {
        // Cả ý nghĩa của nút này là ở lại.
        const i = popup.indexOf("text: 'Giữ nguyên'");
        const khoi = popup.slice(i, popup.indexOf("text: 'Thoát'", i));
        expect(khoi).not.toMatch(/xoaLuaChonTuSai/);
    });

    test('không đóng được bằng cách bấm ra ngoài', () => {
        // Đây là ngã ba bắt buộc chọn; đóng lửng thì người dùng quay lại đúng
        // trạng thái vừa bị chặn mà không hiểu phải làm gì.
        expect(popup).toMatch(/closeOnBackdrop: false/);
    });
});

describe('thẻ chế độ hiện đúng trạng thái', () => {
    test('16 chế độ kia bị làm mờ', () => {
        expect(home).toMatch(
            /const tuSaiLocked = khoaTuSai && m\.mode !== 'review-mistakes'/);
    });

    test('gộp vào `locked` chung', () => {
        // Không gộp thì thẻ vẫn sáng, chỉ có popup khi bấm — hai nơi nói hai kiểu.
        expect(home).toMatch(/\|\| schedLocked \|\| tuSaiLocked;/);
    });

    test('huy hiệu nói rõ LÝ DO, không chỉ "bị khoá"', () => {
        // Đây là khoá người dùng tự gỡ được ngay.
        expect(home).toMatch(/\) : tuSaiLocked \? \(/);
        expect(home).toMatch(/Đang ôn <b>từ sai<\/b>/);
    });
});

describe('hàm bỏ chọn có sẵn và làm đủ việc', () => {
    const than = (() => {
        const i = pm.indexOf('xoaLuaChonTuSai() {');
        expect(i).toBeGreaterThan(-1);
        return pm.slice(i, pm.indexOf('\n    },', i));
    })();

    test('chỉ xoá khi đang là đề TỪ SAI', () => {
        // Xoá vô điều kiện là bỏ luôn đề thường người dùng đang chọn.
        expect(than).toMatch(/startsWith\('wrong:'\)\) return;/);
    });

    test('xoá cả `selectedPart` ở HAI nơi', () => {
        // `settings` là bản sao thứ hai của cùng một lựa chọn; bỏ sót thì popup
        // Part mở ra với Part cũ đã tick sẵn.
        expect(than).toMatch(/PartSelector\.selectedPart = null/);
        expect(than).toMatch(/settings\.selectedPart = null/);
    });
});
