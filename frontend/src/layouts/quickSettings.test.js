/**
 * Ba lựa chọn nhanh (số câu · độ khó · ngôn ngữ) dùng CHUNG một component.
 *
 * Trên máy tính chúng ở thanh trạng thái; trên điện thoại thanh đó không đủ chỗ
 * nên chúng chuyển vào menu bên. Cách sai là chép sang menu một bản nữa —
 * `handleDifficultyChange` còn phải đồng bộ `levelFilter`, đổi ngôn ngữ có khoá
 * theo level + ghi localStorage + reload. Hai bản chép sẽ lệch nhau ngay lần sửa
 * đầu, mà triệu chứng là "đổi ở chỗ này thì ăn, chỗ kia thì không".
 *
 * Ba chỗ dễ hỏng im lặng:
 *   1. `levelFilter` không được đặt → đổi độ khó chẳng có tác dụng gì, mà giao
 *      diện vẫn hiện đúng lựa chọn mới.
 *   2. Hai bản cùng tồn tại mà không đồng bộ → mở menu thấy giá trị cũ.
 *   3. StatusBar giữ lại bản sao của logic → sửa một nơi, nơi kia vẫn cũ.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const strip = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

const quick = strip(readFileSync(join(__dirname, 'QuickSettings.jsx'), 'utf8'));
const statusBar = strip(readFileSync(join(__dirname, 'StatusBar.jsx'), 'utf8'));
const sideMenu = strip(readFileSync(join(__dirname, 'SideMenu.jsx'), 'utf8'));

describe('dùng chung, không nhân bản', () => {
    test('cả StatusBar lẫn SideMenu đều dựng QuickSettings', () => {
        expect(statusBar).toMatch(/import QuickSettings from '\.\/QuickSettings\.jsx'/);
        expect(sideMenu).toMatch(/import QuickSettings from '\.\/QuickSettings\.jsx'/);
        expect(statusBar).toMatch(/<QuickSettings \/>/);
        expect(sideMenu).toMatch(/<QuickSettings variant="menu" \/>/);
    });

    test('StatusBar KHÔNG còn giữ bản sao của logic', () => {
        // Sót lại là hai đường code cho cùng một việc — sửa một nơi, nơi kia cũ.
        expect(statusBar).not.toMatch(/handleDifficultyChange/);
        expect(statusBar).not.toMatch(/handleQuestionsChange/);
        expect(statusBar).not.toMatch(/handleToggleVocabLang/);
        expect(statusBar).not.toMatch(/levelFilter/);
        expect(statusBar).not.toMatch(/LEVEL_MAP/);
    });

    test('logic chỉ tồn tại MỘT bản, trong QuickSettings', () => {
        expect(quick).toMatch(/const handleDifficultyChange/);
        expect(quick).toMatch(/const handleQuestionsChange/);
        expect(quick).toMatch(/const handleToggleVocabLang/);
    });
});

describe('hành vi phải giữ nguyên sau khi tách', () => {
    test('đổi độ khó vẫn đặt `levelFilter` — bộ lọc đọc trường ĐÓ', () => {
        // Bộ lọc từ vựng đọc `levelFilter`, không đọc `difficulty`. Thiếu dòng
        // này thì đổi cấp độ không có tác dụng, mà giao diện vẫn hiện lựa chọn
        // mới nên trông như đã ăn.
        expect(quick).toMatch(/s\.levelFilter = LEVEL_MAP\[val\] \?\? null/);
    });

    test('chỉ khoá chiều SANG tiếng Trung, luôn cho quay về tiếng Anh', () => {
        // Khoá cả hai chiều thì ai đang ở 'zh' mà mốc bị nâng lên sẽ kẹt luôn.
        expect(quick).toMatch(/next === 'zh' && zhLock\.locked/);
    });

    test('khách chưa đăng nhập thì mời đăng nhập, không đổi rồi reload', () => {
        expect(quick).toMatch(/if \(!isLoggedIn\)/);
        expect(quick).toMatch(/setAuthModal\('login'\)/);
    });

    test('ghi localStorage có bọc try — chế độ riêng tư chặn là ném lỗi', () => {
        expect(quick).toMatch(/try \{\s*localStorage\.setItem\('vocabLang', next\)/);
    });
});

describe('hai bản cùng tồn tại thì phải đồng bộ', () => {
    test('nghe sự kiện để bản kia đổi thì bản này theo', () => {
        // Thanh trạng thái và menu bên cùng nằm trong cây. Không nghe thì mở
        // menu ra vẫn thấy giá trị cũ và người dùng đổi lại lần nữa.
        expect(quick).toMatch(/EventBus\.on\(GameEvents\.SESSION_BADGE_UPDATED, sync\)/);
    });

    test('đổi độ khó cũng PHÁT sự kiện, không chỉ đổi số câu', () => {
        // Chỉ số câu phát sự kiện thì bản kia không bao giờ biết độ khó đã đổi.
        const i = quick.indexOf('const handleDifficultyChange');
        const j = quick.indexOf('const handleToggleVocabLang');
        expect(quick.slice(i, j)).toMatch(/EventBus\.emit\(GameEvents\.SESSION_BADGE_UPDATED\)/);
    });

    test('gỡ đăng ký khi tháo khỏi cây', () => {
        expect(quick).toMatch(/return \(\) => unsub\?\.\(\)/);
    });
});

describe('bản trong menu', () => {
    test('có NHÃN CHỮ — điện thoại không hover được để đọc `title`', () => {
        expect(quick).toMatch(/className="menu-quick-label"/);
        expect(quick).toMatch(/Số câu mỗi lượt/);
        expect(quick).toMatch(/Độ khó/);
        expect(quick).toMatch(/Ngôn ngữ học/);
    });

    test('id KHÁC bản ở thanh trạng thái — trùng id là DOM sai', () => {
        // Hai bản cùng render, id trùng thì `document.getElementById` trả về bản
        // đầu tiên và `<label for>` trỏ nhầm ô.
        expect(quick).toMatch(/id="menu-questions-select"/);
        expect(quick).toMatch(/id="quick-questions-select"/);
        expect(quick).toMatch(/id="menu-difficulty-select"/);
        expect(quick).toMatch(/id="quick-difficulty-select"/);
    });
});
