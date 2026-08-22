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
        expect(pm).toMatch(/mode === 'review-mistakes'/);
        expect(pm).toMatch(/TOPIC_MODAL_REQUESTED, \{ pendingMode: mode \}/);
    });

    test('đề đang chọn ĐÃ là nhóm từ sai → VẪN hỏi lại', () => {
        // Đảo lại luật cũ. Trước đây đề còn là nhóm `wrong:` thì bỏ qua popup —
        // nghĩa là lượt hai trở đi vào thẳng bước chọn Part.
        //
        // Nhóm từ sai THAY ĐỔI sau mỗi lượt: từ trả lời đúng rời khỏi danh sách
        // đến hạn. Nhóm của lượt trước không còn là nhóm người dùng muốn ôn
        // lượt này, nên mỗi lượt phải là một lựa chọn mới.
        expect(pm).not.toMatch(/dangLaNhomTuSai/);
        // Và lựa chọn cũ bị xoá khi rời chế độ, để lần vào sau không có gì để
        // đi tắt qua.
        expect(pm).toMatch(/xoaLuaChonTuSai\(\)/);
    });

    test('ĐI CHUNG đường với mọi chế độ: chọn đề rồi chọn Part', () => {
        // Trước đây nó nhảy thẳng vào bài sau khi chọn đề, với lý do "pool không
        // chia theo Part". Sai với dữ liệu thật: 208/208 từ sai trong DB đều có
        // `part`. Ôn lẫn lộn từ của 12 nhóm trong một lượt thì không tập trung
        // vào chỗ nào cả.
        // Cấm đúng HÀNH VI "chọn đề xong vào thẳng bài", không cấm mọi câu `if`
        // nhắc tới chế độ này — TopNav vẫn cần nhánh riêng để đặt cờ một lần.
        // Gỡ comment trước khi soi: chú thích ngay dưới đó có nhắc
        // `PRACTICE_REQUESTED`, mà chữ trong comment không phải hành vi.
        const navCode = nav.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
        expect(navCode).not.toMatch(/review-mistakes'\)[\s\S]{0,200}PRACTICE_REQUESTED/);
        expect(nav).toMatch(/showPartSelectionModal/);
    });

    test('vẫn hoãn trước khi mở popup Part — popup đề chưa gỡ khỏi DOM', () => {
        // `onSelected()` chạy TRƯỚC `onClose()`, nên hai modal cùng `id` tồn tại
        // đồng thời trong một nhịp. Lối chung đã có `setTimeout` cho việc này.
        const i = nav.indexOf('const handleTopicSelected');
        const than = nav.slice(i, nav.indexOf('}, []);', i));
        expect(than).toMatch(/setTimeout\(/);
        // Và `showPartSelectionModal` phải nằm TRONG `setTimeout` đó.
        expect(than.indexOf('setTimeout('))
            .toBeLessThan(than.indexOf('showPartSelectionModal'));
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
