/**
 * Khoá tab chéo trong popup "Chọn đề luyện tập".
 *
 * Hai chiều ràng buộc, và cả hai đều là chuyện pool dữ liệu không dùng chung:
 *   · Chế độ thường (trắc nghiệm, điền từ…) lấy pool từ BỘ TỪ VỰNG → tab
 *     "Từ vựng sai" vô nghĩa.
 *   · Chế độ "Ôn lại từ sai" lấy pool từ DANH SÁCH LỖI → hai tab kia vô nghĩa.
 *
 * Trước đây popup cho chọn tự do, nên chọn nhầm là chế độ chạy với pool rỗng
 * hoặc ôn lẫn lộn mọi nguồn — không lỗi nào báo.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const modal = readFileSync(join(__dirname, 'TopicModal.jsx'), 'utf8');
const nav = readFileSync(join(__dirname, '..', '..', '..', 'layouts', 'TopNav.jsx'), 'utf8');
const pm = readFileSync(
    join(__dirname, '..', '..', 'practice', 'practiceManager.js'), 'utf8');
const css = readFileSync(
    join(__dirname, '..', '..', '..', 'assets', 'styles', 'components.css'), 'utf8');

/** Chạy THẬT hàm quyết định khoá, cắt từ nguồn. */
function loadTabBiKhoa(mode) {
    // Cắt ĐÚNG hai dòng khai báo. Cắt tới dòng trống gần nhất thì lấn sang JSX
    // phía dưới và `new Function` nổ ở dấu `<`.
    const lines = modal.split('\n');
    const i = lines.findIndex((l) => l.includes('const chiTuSai ='));
    expect(i).toBeGreaterThan(-1);
    const body = lines.slice(i, i + 2).join('\n');
    expect(body).toContain('tabBiKhoa');
    return new Function('mode', `${body}; return tabBiKhoa;`)(mode);
}

describe('chế độ THƯỜNG — khoá tab Từ vựng sai', () => {
    const khoa = loadTabBiKhoa('multiple-choice');

    test('tab "Từ vựng sai" bị khoá', () => {
        expect(khoa('wrong')).toBe(true);
    });

    test('hai tab kia mở bình thường', () => {
        expect(khoa('shared')).toBe(false);
        expect(khoa('personal')).toBe(false);
    });
});

describe('chế độ ÔN LẠI TỪ SAI — khoá hai tab kia', () => {
    const khoa = loadTabBiKhoa('review-mistakes');

    test('chỉ tab "Từ vựng sai" mở', () => {
        expect(khoa('wrong')).toBe(false);
    });

    test('"Từ vựng chung" và "Từ vựng riêng" bị khoá', () => {
        expect(khoa('shared')).toBe(true);
        expect(khoa('personal')).toBe(true);
    });
});

describe('mode không xác định → coi như chế độ thường', () => {
    test('null vẫn khoá đúng tab từ sai', () => {
        // Popup còn mở từ nút "Chọn đề" trên nav, không kèm chế độ nào.
        const khoa = loadTabBiKhoa(null);
        expect(khoa('wrong')).toBe(true);
        expect(khoa('shared')).toBe(false);
    });
});

describe('nút bị khoá phải THẬT SỰ không bấm được', () => {
    test('cả ba nút đều có `disabled`', () => {
        // Chỉ làm mờ bằng CSS thì vẫn bấm được — khoá phải ở hành vi.
        const n = (modal.match(/disabled=\{tabBiKhoa\(/g) || []).length;
        expect(n).toBe(3);
    });

    test('có lý do bằng `title`, không khoá câm', () => {
        // `disabled` mà không nói vì sao thì người dùng tưởng hỏng.
        expect(modal).toMatch(/LY_DO_KHOA/);
        expect(modal).toMatch(/chỉ luyện trên nhóm từ bạn đã làm sai/);
        expect(modal).toMatch(/chỉ dùng được ở chế độ/);
    });

    test('CSS làm mờ và bỏ hover', () => {
        // Hover đổi màu trên thứ bấm không được là hứa hão.
        expect(css).toMatch(/\.topic-tabs \.tab-btn\.is-locked\s*\{[^}]*cursor:\s*not-allowed/);
        expect(css).toMatch(/\.topic-tabs \.tab-btn\.is-locked:hover/);
    });
});

describe('popup KHÔNG mở vào tab đã khoá', () => {
    test('chế độ ôn từ sai → mở thẳng tab wrong', () => {
        expect(modal).toMatch(/chiTuSai \? "wrong" : tabOfCurrentTopic\(\)/);
    });

    test('đề đang chọn LÀ nhóm từ sai + chế độ thường → rơi về tab shared', () => {
        // Người dùng vừa ôn xong rồi bấm chế độ khác: tab mặc định suy từ đề
        // đang chọn sẽ là "wrong" — đúng tab vừa bị khoá.
        expect(modal).toMatch(/tabBiKhoa\(mongMuon\) \? \(chiTuSai \? "wrong" : "shared"\) : mongMuon/);
    });
});

describe('luồng chạy của chế độ Ôn lại từ sai', () => {
    test('BẮT chọn nhóm từ sai trước khi chạy', () => {
        // Trước đây nó bỏ qua bước chọn đề và ôn lẫn lộn mọi nguồn.
        expect(pm).toMatch(/mode === 'review-mistakes' && !dangLaNhomTuSai/);
        expect(pm).toMatch(/startsWith\('wrong:'\)/);
    });

    test('đề đang chọn ĐÃ là nhóm từ sai → không hỏi lại', () => {
        const i = pm.indexOf('dangLaNhomTuSai');
        expect(pm.slice(i, i + 300)).toMatch(/!dangLaNhomTuSai/);
    });

    test('KHÔNG qua popup chọn Part', () => {
        // Pool là các từ đã sai trong nhóm, không chia theo Part — hỏi Part là
        // hỏi một câu không có câu trả lời đúng.
        const i = nav.indexOf("if (mode === 'review-mistakes')");
        expect(i).toBeGreaterThan(-1);
        const body = nav.slice(i, i + 500);
        expect(body).toMatch(/PRACTICE_REQUESTED/);
        expect(body).not.toMatch(/showPartSelectionModal/);
    });

    test('hoãn trước khi vào màn luyện — popup cũ chưa gỡ khỏi DOM', () => {
        const i = nav.indexOf("if (mode === 'review-mistakes')");
        expect(nav.slice(i, i + 500)).toMatch(/setTimeout\(/);
    });

    test('mode truyền xuống popup bằng STATE, không phải ref', () => {
        // Ref không kích hoạt render nên popup sẽ khoá sai tab.
        expect(nav).toMatch(/const \[topicMode, setTopicMode\] = useState\(null\)/);
        expect(nav).toMatch(/mode=\{topicMode\}/);
    });

    test('đóng popup thì xoá mode — lần mở sau không kế thừa', () => {
        const i = nav.indexOf('const handleTopicClose');
        expect(nav.slice(i, i + 300)).toMatch(/setTopicMode\(null\)/);
    });
});
