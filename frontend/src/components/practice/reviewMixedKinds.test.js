/**
 * "Ôn lại từ sai" — kiểm tra HỖN HỢP.
 *
 * Mỗi câu một kiểu hỏi, đan xen liên tục trong cùng một lượt: câu này chọn
 * nghĩa, câu sau có thể là gõ từ. Không phải làm hết một kiểu rồi mới sang kiểu
 * khác.
 *
 * Kiểu do mức thuộc SM-2 của TỪNG TỪ quyết định, không xoay vòng theo vị trí:
 * một từ vừa sai lần đầu và một từ sắp thuộc cần hai cách kiểm tra khác nhau dù
 * chúng đứng cạnh nhau. Dữ liệu `masteryLevel` đã có sẵn trong DB (208 từ), nên
 * không cần gọi AI — AI phải đoán lại đúng thứ SM-2 đã biết từ lịch sử thật.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'modes', 'reviewMistakes.js'), 'utf8');
const panel = readFileSync(
    join(__dirname, '..', 'settings', 'panels', 'PracticePanel.jsx'), 'utf8');
const schema = readFileSync(
    join(__dirname, '..', '..', '..', '..', 'backend', 'models', 'UserProfile.js'), 'utf8');
const css = readFileSync(
    join(__dirname, '..', '..', 'assets', 'styles', 'components.css'), 'utf8');

/** Nạp các hàm thuần từ nguồn, với `GameState` giả. */
function napBoChon(settings = {}) {
    const i = src.indexOf('const KIEU_HOI');
    const j = src.indexOf('export const ReviewMistakes');
    const GameState = { state: { settings } };
    return new Function('GameState',
        `${src.slice(i, j)}; return { kieuTheoMucThuoc, chonKieu, kieuDuocPhep, KIEU_HOI };`
    )(GameState);
}

describe('SM-2 chọn kiểu theo mức thuộc của TỪNG TỪ', () => {
    const M = napBoChon();

    test('vừa sai (0–1) → chọn nghĩa, dễ nhất', () => {
        // Bắt gõ ngay từ mình vừa quên là chắc chắn sai lần nữa, không học được gì.
        expect(M.kieuTheoMucThuoc({ masteryLevel: 0 })).toBe('choice');
        expect(M.kieuTheoMucThuoc({ masteryLevel: 1 })).toBe('choice');
    });

    test('đã nhận ra được (2–3) → đúng/sai', () => {
        expect(M.kieuTheoMucThuoc({ masteryLevel: 2 })).toBe('truefalse');
        expect(M.kieuTheoMucThuoc({ masteryLevel: 3 })).toBe('truefalse');
    });

    test('sắp thuộc (4–5) → gõ từ, khó nhất', () => {
        // Chỉ khi gõ ra được mới là thuộc thật.
        expect(M.kieuTheoMucThuoc({ masteryLevel: 4 })).toBe('fill');
        expect(M.kieuTheoMucThuoc({ masteryLevel: 5 })).toBe('fill');
    });

    test('thiếu masteryLevel → coi như 0, không nổ', () => {
        // 205/208 từ trong DB đang ở mastery 0; bản ghi cũ có thể thiếu hẳn trường.
        expect(M.kieuTheoMucThuoc({})).toBe('choice');
        expect(M.kieuTheoMucThuoc(null)).toBe('choice');
        expect(M.kieuTheoMucThuoc({ masteryLevel: 'x' })).toBe('choice');
    });

    test('ba kiểu xếp theo độ khó TĂNG DẦN', () => {
        // Thứ tự này là thứ `chonKieu` dựa vào để lùi về kiểu dễ hơn.
        expect(M.KIEU_HOI).toEqual(['choice', 'truefalse', 'fill']);
    });
});

describe('người dùng tự chọn kiểu — cài đặt thắng SM-2', () => {
    test('tắt "Gõ từ" thì từ sắp thuộc lùi về đúng/sai', () => {
        // LÙI VỀ kiểu dễ hơn, không nhảy lên kiểu khó hơn: người tắt "Gõ từ" là
        // người không muốn gõ.
        const M = napBoChon({ reviewKinds: ['choice', 'truefalse'] });
        const cp = M.kieuDuocPhep();
        expect(M.chonKieu({ masteryLevel: 5 }, cp)).toBe('truefalse');
        expect(M.chonKieu({ masteryLevel: 0 }, cp)).toBe('choice');
    });

    test('chỉ bật "Gõ từ" thì mọi từ đều gõ', () => {
        // Không còn kiểu nào dễ hơn → lấy kiểu bật đầu tiên.
        const M = napBoChon({ reviewKinds: ['fill'] });
        const cp = M.kieuDuocPhep();
        expect(M.chonKieu({ masteryLevel: 0 }, cp)).toBe('fill');
    });

    test('bỏ tick hết = KHÔNG giới hạn, không phải rỗng', () => {
        // Mảng rỗng nghĩa là "không giới hạn". Hiểu là "không kiểu nào" thì lượt
        // ôn không có câu nào — vô dụng, mà người dùng không hề muốn thế.
        for (const v of [[], undefined, null, ['xyz']]) {
            const M = napBoChon({ reviewKinds: v });
            expect(M.kieuDuocPhep()).toEqual(['choice', 'truefalse', 'fill']);
        }
    });

    test('lọc bỏ giá trị lạ nhưng giữ giá trị hợp lệ', () => {
        const M = napBoChon({ reviewKinds: ['fill', 'khong-ton-tai'] });
        expect(M.kieuDuocPhep()).toEqual(['fill']);
    });
});

describe('mỗi câu một kiểu, đan xen trong cùng lượt', () => {
    test('kiểu gắn theo TỪ, không theo vị trí trong danh sách', () => {
        // Xoay vòng `i % 3` thì từ vừa sai lần đầu vẫn có thể rơi vào câu gõ.
        expect(src).toMatch(/const kieu = chonKieu\(word, choPhep\)/);
        expect(src).not.toMatch(/KIEU_HOI\[i % KIEU_HOI\.length\]/);
    });

    test('mỗi câu mang kiểu riêng của nó', () => {
        // `kieu` đi kèm từng câu để `render` biết vẽ thân nào.
        expect(src).toMatch(/\.\.\.GameLogic\.generateFillBlank\(word\), kieu/);
        expect(src).toMatch(/\.\.\.GameLogic\.generateSpeedQuiz\(word, 2\), kieu/);
        expect(src).toMatch(/\.\.\.GameLogic\.generateMultipleChoice\([^)]+\), kieu/);
    });

    test('dùng lại bộ sinh có sẵn, không viết lại', () => {
        // Ba bộ sinh này đã được các chế độ khác dùng và có test riêng.
        for (const g of ['generateMultipleChoice', 'generateFillBlank', 'generateSpeedQuiz']) {
            expect(src).toContain(`GameLogic.${g}(`);
        }
    });
});

describe('chấm điểm gom về một chỗ', () => {
    test('ba kiểu cùng đi qua ketThucCau', () => {
        // Mỗi kiểu tự lặp lại đoạn ghi điểm thì sửa luật tính điểm phải sửa ba nơi.
        expect((src.match(/this\.ketThucCau\(/g) || []).length).toBe(3);
    });

    test('không chấm hai lần khi bấm liên tiếp', () => {
        // Bấm nhanh hai lần vào cùng một nút là hai lần ghi điểm cho một câu.
        expect(src).toMatch(/if \(input\.disabled\) return|input\.disabled\) return/);
        expect(src).toMatch(/if \(btnDaBam\?\.disabled\) return/);
        expect(src).toMatch(/if \(choices\[index\]\?\.disabled\) return/);
    });

    test('Enter nộp câu gõ, nhưng KHÔNG cướp Enter của bộ gõ tiếng Trung', () => {
        // Bộ gõ dùng Enter để chọn chữ trong danh sách gợi ý; không chặn thì vừa
        // gõ pinyin xong nhấn Enter là nộp luôn chuỗi chưa thành chữ.
        expect(src).toMatch(/e\.key === 'Enter' && !e\.isComposing/);
    });
});

describe('thanh trạng thái mức thuộc', () => {
    test('hiện 5 chấm kèm số', () => {
        // Con số 3/5 một mình không cho thấy tiến trình; 5 chấm thì liếc là thấy.
        expect(src).toMatch(/rm-dot/);
        expect(src).toMatch(/rm-mastery-text/);
        expect(css).toMatch(/\.rm-dot\.is-on/);
    });

    test('kẹp mức thuộc trong 0–5', () => {
        // Dữ liệu hỏng (số âm, hoặc 9) không được vẽ ra 9 chấm.
        expect(src).toMatch(/Math\.max\(0, Math\.min\(5,/);
    });

    test('nói rõ câu này đang hỏi kiểu gì', () => {
        // Ba kiểu có cách trả lời khác nhau — người học cần biết trước khi nhìn xuống.
        expect(src).toMatch(/NHAN_KIEU\[question\.kieu\]/);
        expect(css).toMatch(/\.rm-kind/);
    });
});

describe('ô chọn kiểu trong Cài đặt', () => {
    test('có đủ ba ô', () => {
        expect(panel).toMatch(/const REVIEW_KINDS = \[/);
        for (const k of ['choice', 'truefalse', 'fill']) {
            expect(panel).toContain(`key: '${k}'`);
        }
    });

    test('chưa đặt gì thì hiện CẢ BA đã tick', () => {
        // Ba ô trống làm người dùng tự hỏi mình đã tắt cái gì.
        expect(panel).toMatch(/Array\.isArray\(s\.reviewKinds\) && s\.reviewKinds\.length/);
    });

    test('mỗi ô có mô tả, không chỉ tên', () => {
        // "Đúng / Sai" một mình không nói lên nó khác "Chọn nghĩa" thế nào.
        expect(panel).toMatch(/desc: 'Chọn đáp án đúng trong 4 lựa chọn'/);
        expect(panel).toMatch(/desc: 'Tự gõ ra, không có gợi ý/);
    });
});

describe('server không xoá mất lựa chọn', () => {
    test('reviewKinds có trong schema', () => {
        // Mongoose ở chế độ `strict` XOÁ ÂM THẦM trường không khai — lựa chọn
        // lưu xong là mất, không lỗi nào báo.
        expect(schema).toMatch(/reviewKinds: \{ type: \[String\]/);
    });
});
