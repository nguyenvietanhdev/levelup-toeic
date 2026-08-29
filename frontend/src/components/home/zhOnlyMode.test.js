/**
 * Chế độ chỉ chạy với bộ từ tiếng Trung (`zhOnly`).
 *
 * Bản đầu ẨN HẲN thẻ khi học tiếng Anh. Đổi thành HIỆN NHƯNG KHOÁ: ẩn thì người
 * học tiếng Anh không bao giờ biết app có chế độ này, mà nó là một lý do để họ
 * thử học tiếng Trung. Khoá thì họ thấy và hiểu cần đổi ngôn ngữ.
 *
 * Chỗ dễ hỏng nhất: làm mờ thẻ bằng CSS mà quên chặn `onClick`. Thẻ vẫn bấm
 * được, vào bài rồi mới vỡ ở chỗ không có chữ Hán nào để tô — mà lúc đó năng
 * lượng đã bị trừ.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const home = readFileSync(join(__dirname, 'HomeScreen.jsx'), 'utf8');

/** Khối `gameModes` — nơi khai 16 thẻ. */
function khoiTheGoc() {
    const i = home.indexOf('const gameModes = [');
    return home.slice(i, home.indexOf('\n];', i));
}

describe('vị trí thẻ', () => {
    test('nằm trong nhóm "Nâng cao & Thử thách"', () => {
        // Tô đúng thứ tự nét là việc khó nhất trong app với người mới học chữ
        // Hán — xếp ở "Đọc & Viết" là đặt nhầm mức độ.
        const khoi = khoiTheGoc();
        const iNhom = khoi.indexOf("group: 'Nâng cao & Thử thách'");
        const iThe = khoi.indexOf("mode: 'hanzi-writing'");
        expect(iNhom).toBeGreaterThan(-1);
        expect(iThe).toBeGreaterThan(iNhom);
    });

    test('KHÔNG còn ở nhóm "Đọc & Viết"', () => {
        const khoi = khoiTheGoc();
        const iDocViet = khoi.indexOf("group: 'Đọc & Viết'");
        const iNangCao = khoi.indexOf("group: 'Nâng cao & Thử thách'");
        const iThe = khoi.indexOf("mode: 'hanzi-writing'");
        // Thẻ phải nằm SAU mốc mở nhóm Nâng cao, tức ngoài phạm vi Đọc & Viết.
        expect(iThe).toBeGreaterThan(iNangCao);
        expect(iDocViet).toBeLessThan(iNangCao);
    });
});

describe('hiện nhưng khoá khi học tiếng Anh', () => {
    test('KHÔNG lọc bỏ khỏi danh sách nữa', () => {
        // `.filter(m => !m.zhOnly || ...)` là cách cũ — ẩn hẳn thẻ.
        expect(home).not.toMatch(/\.filter\(m => !m\.zhOnly/);
    });

    test('có trạng thái khoá riêng theo ngôn ngữ', () => {
        expect(home).toMatch(/const langLocked = m\.zhOnly && !coChuHan\(getVocabLang\(\)\)/);
    });

    test('kho SONG NGỮ không bị khoá — nó cũng đầy chữ Hán', () => {
        // So `!== 'zh'` trần thì khoá nhầm kho `bi`, mà người dùng đang ở kho
        // đầy chữ Hán lại được bảo "đổi sang tiếng Trung để dùng".
        expect(home).toMatch(/const coChuHan = \(lang\) => lang === 'zh' \|\| lang === 'bi'/);
    });

    test('`langLocked` gộp vào `locked` — thẻ hiện đúng dạng bị khoá', () => {
        const i = home.indexOf('const locked = guestLocked');
        expect(home.slice(i, home.indexOf(';', i))).toMatch(/langLocked/);
    });

    test('huy hiệu nói rõ ĐIỀU KIỆN, không chỉ "bị khoá"', () => {
        // Đây là khoá người dùng tự mở được ngay bằng cách đổi ngôn ngữ, khác
        // hẳn khoá theo Level phải cày mới tới.
        expect(home).toMatch(/langLocked \? \(/);
        expect(home).toMatch(/Cần học <b>tiếng Trung<\/b>/);
    });
});

describe('chặn ở luồng bấm, không chỉ ở CSS', () => {
    test('`handleModeClick` chặn trước khi vào bài', () => {
        // Làm mờ bằng CSS mà `onClick` vẫn gắn trên thẻ thì bấm vào vẫn vào
        // bài, rồi vỡ ở chỗ không có chữ Hán nào để tô — lúc đó năng lượng đã
        // bị trừ.
        const i = home.indexOf('const handleModeClick');
        const than = home.slice(i, home.indexOf('\n    };', i));
        expect(than).toMatch(/modeConfig\?\.zhOnly && !coChuHan\(getVocabLang\(\)\)/);
        // Và phải `return` chứ không chạy tiếp.
        const j = than.indexOf('zhOnly');
        expect(than.slice(j, j + 400)).toMatch(/return;/);
    });

    test('chặn ĐỨNG TRƯỚC bước trừ năng lượng / mở bài', () => {
        const i = home.indexOf('const handleModeClick');
        const than = home.slice(i, home.indexOf('\n    };', i));
        expect(than.indexOf('zhOnly')).toBeLessThan(than.indexOf('PracticeManager.start'));
    });

    test('thông báo chỉ ra cách mở, không chỉ báo lỗi', () => {
        const i = home.indexOf("modeConfig?.zhOnly");
        // Nêu CẢ HAI bộ dùng được: người ở kho `bi` mà chỉ được bảo "đổi sang
        // tiếng Trung" thì không hiểu mình đang thiếu gì.
        expect(home.slice(i, i + 500)).toMatch(/Tiếng Trung hoặc Trung–Anh/);
    });
});
