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

describe('xoay vòng đủ BA kiểu theo vị trí câu', () => {
    const M = napBoChon();

    test('câu 1 chọn nghĩa → câu 2 đúng/sai → câu 3 gõ từ', () => {
        // Đây là thứ người dùng thấy trực tiếp: câu này một kiểu, câu sau kiểu
        // khác. Không phải làm hết một kiểu rồi mới sang kiểu khác.
        const cp = M.kieuDuocPhep();
        const w = { masteryLevel: 0 };
        expect([0, 1, 2, 3, 4, 5].map(i => M.chonKieu(w, cp, i)))
            .toEqual(['choice', 'truefalse', 'fill', 'choice', 'truefalse', 'fill']);
    });

    test('KHÔNG phụ thuộc mức thuộc', () => {
        // Bản đầu chọn kiểu theo `masteryLevel`. Nhưng 208/208 từ trong DB đang
        // ở mastery 0–1 nên MỌI câu ra `choice`: lý thuyết là hỗn hợp, thực tế
        // là một kiểu duy nhất suốt cả lượt — đúng thứ người dùng báo.
        const cp = M.kieuDuocPhep();
        for (const m of [0, 1, 2, 3, 4, 5]) {
            expect(M.chonKieu({ masteryLevel: m }, cp, 2)).toBe('fill');
        }
    });

    test('vị trí hỏng → vẫn ra kiểu hợp lệ, không undefined', () => {
        const cp = M.kieuDuocPhep();
        for (const v of [undefined, null, NaN, -1, 'x']) {
            expect(M.KIEU_HOI ?? ['choice', 'truefalse', 'fill'])
                .toContain(M.chonKieu({ masteryLevel: 0 }, cp, v));
        }
    });

    test('xoay vòng, KHÔNG ngẫu nhiên', () => {
        // Ngẫu nhiên có thể ra bốn câu gõ liên tiếp — mệt và nản đúng ở chế độ
        // vốn đã khó. Gọi lại cùng vị trí phải cho cùng kết quả.
        const cp = M.kieuDuocPhep();
        const w = { masteryLevel: 0 };
        for (let i = 0; i < 6; i++) {
            expect(M.chonKieu(w, cp, i)).toBe(M.chonKieu(w, cp, i));
        }
        expect(src).not.toMatch(/Math\.random\(\)/);
    });

    test('ba kiểu xếp theo độ khó TĂNG DẦN', () => {
        // Thứ tự này quyết định thứ tự xoay vòng: dễ trước để người học vào nhịp.
        expect(M.KIEU_HOI).toEqual(['choice', 'truefalse', 'fill']);
    });
});

describe('người dùng tự chọn kiểu — cài đặt thắng SM-2', () => {
    test('tắt "Gõ từ" thì câu đáng lẽ gõ lùi về đúng/sai', () => {
        // LÙI VỀ kiểu dễ hơn, không nhảy lên kiểu khó hơn: người tắt "Gõ từ" là
        // người không muốn gõ.
        const M = napBoChon({ reviewKinds: ['choice', 'truefalse'] });
        const cp = M.kieuDuocPhep();
        const w = { masteryLevel: 0 };
        expect(M.chonKieu(w, cp, 2)).toBe('truefalse');   // vị trí 2 vốn là fill
        expect(M.chonKieu(w, cp, 0)).toBe('choice');
    });

    test('chỉ bật "Gõ từ" thì mọi câu đều gõ', () => {
        // Không còn kiểu nào dễ hơn → lấy kiểu bật đầu tiên.
        const M = napBoChon({ reviewKinds: ['fill'] });
        const cp = M.kieuDuocPhep();
        for (const i of [0, 1, 2]) {
            expect(M.chonKieu({ masteryLevel: 0 }, cp, i)).toBe('fill');
        }
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
    test('mỗi câu nhận VỊ TRÍ của nó để xoay vòng', () => {
        // Không truyền `i` thì mọi câu dùng vị trí mặc định 0 và cùng ra một
        // kiểu — hỏng đúng thứ vừa sửa.
        expect(src).toMatch(/const kieu = chonKieu\(word, choPhep, i\)/);
        expect(src).toMatch(/formattedWords\.map\(\(word, i\) =>/);
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

describe('hiện ĐÚNG vế của câu hỏi', () => {
    // Ba bộ sinh không thống nhất tên trường: `generateMultipleChoice` và
    // `generateSpeedQuiz` trả `question`, còn `generateFillBlank` trả
    // `displayWord`. Đọc thiếu một trường thì ở chế độ ĐẢO CHIỀU (VN→EN) màn
    // hình hiện từ tiếng Anh thay vì nghĩa tiếng Việt — tức lộ luôn đáp án.
    const deBai = (() => {
        const i = src.indexOf('function deBai');
        return new Function(`${src.slice(i, src.indexOf('\n}', i) + 2)}; return deBai;`)();
    })();

    test('trắc nghiệm EN→VN hiện từ tiếng Anh', () => {
        expect(deBai({ question: 'due', word: { en: 'due' } })).toBe('due');
    });

    test('trắc nghiệm VN→EN hiện NGHĨA, không lộ từ', () => {
        expect(deBai({ question: 'đến hạn', word: { en: 'due' } })).toBe('đến hạn');
    });

    test('đúng/sai dùng `question` như trắc nghiệm', () => {
        expect(deBai({ question: 'đến hạn', shownAnswer: 'due', word: { en: 'due' } }))
            .toBe('đến hạn');
    });

    test('gõ từ dùng `displayWord`', () => {
        expect(deBai({ displayWord: 'đến hạn', word: { en: 'due' } })).toBe('đến hạn');
    });

    test('cả hai trống → rơi về word.en, không ra undefined', () => {
        expect(deBai({ word: { en: 'due' } })).toBe('due');
    });

    test('dữ liệu hỏng → chuỗi rỗng, không nổ', () => {
        expect(deBai(null)).toBe('');
        expect(deBai({})).toBe('');
    });

    test('markup THẬT SỰ gọi deBai, không đọc thẳng word.en', () => {
        // Có hàm đúng mà markup không dùng thì vô ích: đọc thẳng `word.en` là
        // chế độ đảo chiều hiện từ tiếng Anh thay vì nghĩa — lộ luôn đáp án.
        expect(src).toMatch(/rm-word-text">\$\{deBai\(question\)\}/);
    });
});

describe('chữ dài không tràn ra khỏi khung', () => {
    test('con trực tiếp của flex-column có min-width: 0', () => {
        // Mặc định `min-width: auto` — con KHÔNG co dưới kích thước nội dung,
        // nên câu dài hơn khung thì tràn ngang thay vì xuống dòng.
        expect(css).toMatch(/\.rm-container > \*\s*\{[^}]*min-width:\s*0/);
    });

    test('chữ đem ra hỏi tự xuống dòng', () => {
        // Bộ từ có thể lưu cả cụm ("is there a near here"), không chỉ một từ.
        const i = css.indexOf('.rm-word-text {');
        expect(i).toBeGreaterThan(-1);
        const body = css.slice(i, css.indexOf('}', i));
        expect(body).toMatch(/word-break/);
        expect(body).toMatch(/min-width:\s*0/);
    });
});
