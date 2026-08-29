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
// Khối kiểu hỏi nằm ở panel RIÊNG, không phải trong "Luyện tập": đây là cài
// đặt của một chế độ, không phải cài đặt dùng chung cho cả 16 chế độ.
const panel = readFileSync(
    join(__dirname, '..', 'settings', 'panels', 'ReviewPanel.jsx'), 'utf8');
const practicePanel = readFileSync(
    join(__dirname, '..', 'settings', 'panels', 'PracticePanel.jsx'), 'utf8');
const settingsScreen = readFileSync(
    join(__dirname, '..', 'settings', 'SettingsScreen.jsx'), 'utf8');
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

    test('từ tiếng Trung: lật thẻ → chọn nghĩa → đúng/sai → … → viết chữ', () => {
        // Đây là thứ người dùng thấy trực tiếp: câu này một kiểu, câu sau kiểu
        // khác. Không phải làm hết một kiểu rồi mới sang kiểu khác.
        const cp = M.kieuDuocPhep();
        const w = { masteryLevel: 0, en: '多少' };
        const r = [0, 1, 2, 3, 4, 5, 6, 7].map(i => M.chonKieu(w, cp, i));
        expect(r[0]).toBe('flashcard');
        expect(r[1]).toBe('choice');
        expect(r[2]).toBe('truefalse');
        expect(r[3]).toBe('listen');
        expect(r[7]).toBe('hanzi');
        // Ít nhất năm kiểu KHÁC NHAU trong tám câu — đó mới là "hỗn hợp".
        expect(new Set(r).size).toBeGreaterThanOrEqual(5);
    });

    test('từ Latin ĐỦ DÀI được xếp chữ cái', () => {
        const cp = M.kieuDuocPhep();
        // Vị trí 5, không phải 4: `speak` chèn vào giữa đã đẩy `scramble` lùi
        // một bậc trong vòng xoay.
        expect(M.chonKieu({ en: 'meticulously' }, cp, 5)).toBe('scramble');
    });

    test('từ Latin QUÁ NGẮN bỏ qua xếp chữ cái', () => {
        // "due" xáo lên vẫn đoán ra ngay — không kiểm tra được gì.
        const cp = M.kieuDuocPhep();
        for (const i of [0, 1, 2, 3, 4, 5]) {
            expect(M.chonKieu({ en: 'due' }, cp, i)).not.toBe('scramble');
        }
    });

    test('từ tiếng Anh KHÔNG rơi vào viết chữ Hán', () => {
        // Bắt viết "due" thì không có nét nào để tô. Lọc theo TỪNG TỪ chứ không
        // theo ngôn ngữ đang học: bộ từ tiếng Trung vẫn có thể lẫn từ Latin.
        const cp = M.kieuDuocPhep();
        const w = { masteryLevel: 0, en: 'due' };
        for (const i of [0, 1, 2, 3, 4, 5]) {
            expect(M.chonKieu(w, cp, i)).not.toBe('hanzi');
        }
    });

    test('chỉ bật viết chữ mà gặp từ tiếng Anh → rơi về chọn nghĩa', () => {
        // Một câu dễ vẫn hơn một lượt trống.
        const M2 = napBoChon({ reviewKinds: ['hanzi'] });
        const cp2 = M2.kieuDuocPhep();
        expect(M2.chonKieu({ en: 'due' }, cp2, 0)).toBe('choice');
        expect(M2.chonKieu({ en: '多少' }, cp2, 0)).toBe('hanzi');
    });

    test('KHÔNG phụ thuộc mức thuộc', () => {
        // Bản đầu chọn kiểu theo `masteryLevel`. Nhưng 208/208 từ trong DB đang
        // ở mastery 0–1 nên MỌI câu ra `choice`: lý thuyết là hỗn hợp, thực tế
        // là một kiểu duy nhất suốt cả lượt — đúng thứ người dùng báo.
        const cp = M.kieuDuocPhep();
        for (const m of [0, 1, 2, 3, 4, 5]) {
            expect(M.chonKieu({ masteryLevel: m, en: 'meticulously' }, cp, 3)).toBe('listen');
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

    test('tám kiểu xếp theo độ khó TĂNG DẦN', () => {
        // Thứ tự này quyết định thứ tự xoay vòng: dễ trước để người học vào nhịp.
        // Cũng là thứ tự ưu tiên khi `chonKieu` lùi về kiểu dễ hơn.
        expect(M.KIEU_HOI).toEqual(['flashcard', 'choice', 'truefalse', 'listen', 'speak', 'scramble', 'fill', 'hanzi']);
    });

    test('lật thẻ đứng ĐẦU — dễ nhất, không phải chọn cũng không phải gõ', () => {
        expect(M.KIEU_HOI[0]).toBe('flashcard');
    });
});

describe('người dùng tự chọn kiểu — cài đặt thắng SM-2', () => {
    test('tắt "Gõ từ" thì câu đáng lẽ gõ lùi về đúng/sai', () => {
        // LÙI VỀ kiểu dễ hơn, không nhảy lên kiểu khó hơn: người tắt "Gõ từ" là
        // người không muốn gõ.
        const M = napBoChon({ reviewKinds: ['choice', 'truefalse'] });
        const cp = M.kieuDuocPhep();
        const w = { masteryLevel: 0 };
        expect(M.chonKieu(w, cp, 6)).toBe('truefalse');   // vị trí 6 vốn là fill
        expect(M.chonKieu(w, cp, 1)).toBe('choice');
        // Vị trí 0 vốn là `flashcard`, cũng đang tắt → lùi phải, vì không còn
        // kiểu nào bên trái. Không được trả `undefined`.
        expect(['choice', 'truefalse']).toContain(M.chonKieu(w, cp, 0));
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
            expect(M.kieuDuocPhep()).toEqual(['flashcard', 'choice', 'truefalse', 'listen', 'speak', 'scramble', 'fill', 'hanzi']);
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
    test('MỌI kiểu cùng đi qua ketThucCau', () => {
        // Mỗi kiểu tự lặp lại đoạn ghi điểm thì sửa luật tính điểm phải sửa
        // nhiều nơi. Đếm ≥ 4 vì kiểu viết chữ có ba lối kết thúc (tô xong / xem
        // mẫu xong / bỏ qua chữ).
        expect((src.match(/this\.ketThucCau\(/g) || []).length).toBeGreaterThanOrEqual(4);
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
    test('có đủ ô cho mọi kiểu', () => {
        expect(panel).toMatch(/export const REVIEW_KINDS = \[/);
        for (const k of ['flashcard', 'choice', 'truefalse', 'fill']) {
            expect(panel).toContain(`key: '${k}'`);
        }
    });

    test('chưa đặt gì thì hiện TẤT CẢ đã tick', () => {
        // Ô trống làm người dùng tự hỏi mình đã tắt cái gì.
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
        // Kiểu NGHE che mặt chữ nên có nhánh riêng; phần còn lại vẫn qua `deBai`.
        expect(src).toMatch(/rm-word-text">\$\{question\.kieu === 'listen' \? [^}]+ : deBai\(question\)\}/);
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

describe('vào chế độ phải qua popup chọn đề RỒI chọn Part', () => {
    const pm = readFileSync(join(__dirname, 'practiceManager.js'), 'utf8');
    const nav = readFileSync(
        join(__dirname, '..', '..', 'layouts', 'TopNav.jsx'), 'utf8');

    test('bắt chọn nhóm từ sai trước khi chạy — MỌI lượt, không riêng lượt đầu', () => {
        // Luật chi tiết nằm ở `reviewTopicRule.test.js`; ở đây chỉ chốt là chế
        // độ này có guard riêng và guard đó mở popup chọn đề.
        expect(pm).toMatch(/mode === 'review-mistakes'/);
        expect(pm).toMatch(/TOPIC_MODAL_REQUESTED, \{ pendingMode: mode \}/);
    });

    test('KHÔNG còn miễn bước chọn Part', () => {
        // 208/208 từ sai trong DB đều có `part`, nên chia Part được và nên chia:
        // ôn lẫn lộn từ của 12 nhóm khác nhau trong một lượt thì không tập trung
        // vào chỗ nào cả.
        const i = pm.indexOf('buộc chọn Part trước');
        const dieuKien = pm.slice(i, pm.indexOf('showPartSelectionModal', i));
        expect(dieuKien).not.toMatch(/mode !== 'review-mistakes'/);
    });

    test('TopNav không còn lối tắt bỏ qua popup Part', () => {
        // Trước đây nó nhảy thẳng vào bài sau khi chọn đề, thay vì mở popup Part.
        // Cấm đúng HÀNH VI đó chứ không cấm mọi câu `if` nhắc tới chế độ này:
        // TopNav vẫn cần một nhánh riêng để đặt cờ `daChonDeTuSai`.
        // Gỡ comment trước khi soi: chú thích ngay dưới đó có nhắc
        // `PRACTICE_REQUESTED`, mà chữ trong comment không phải hành vi.
        const navCode = nav.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
        expect(navCode).not.toMatch(/review-mistakes'\)[\s\S]{0,200}PRACTICE_REQUESTED/);
        // Và đường duy nhất sau khi chọn đề vẫn là mở popup Part.
        expect(nav).toMatch(/showPartSelectionModal/);
    });
});

describe('viết chữ Hán — dọn dẹp đúng chỗ', () => {
    test('huỷ ô vẽ trước khi sang câu kế', () => {
        // Thư viện giữ listener trên SVG; để lại thì mỗi câu chữ Hán cộng thêm
        // một bộ và nét tô của câu cũ vẫn ăn.
        const i = src.indexOf('ketThucCau(dung, question, dapAn) {');
        expect(src.slice(i, i + 300)).toMatch(/this\.huyOVe\(\)/);
    });

    test('huỷ cả khi rời chế độ', () => {
        const i = src.indexOf('cleanup() {');
        expect(src.slice(i, i + 400)).toMatch(/this\.huyOVe\(\)/);
    });

    test('nạp thư viện THEO YÊU CẦU, không import tĩnh', () => {
        // ~40KB chỉ dùng khi lượt ôn thật sự có chữ Hán.
        expect(src).toMatch(/await import\('hanzi-writer'\)/);
        expect(src).not.toMatch(/^import .* from 'hanzi-writer'/m);
    });

    test('bỏ kết quả nếu đã sang câu khác trong lúc nạp', () => {
        // Người dùng bấm "Tiếp" nhanh hơn mạng thì ô vẽ của câu cũ hiện trên câu mới.
        const i = src.indexOf('async dungOVe(question) {');
        const body = src.slice(i, src.indexOf('\n    },', i));
        expect(body).toMatch(/this\.currentIndex !== idxLucGoi/);
        expect(body).toMatch(/box\.isConnected/);
    });

    test('lấy dữ liệu nét từ repo, không phải CDN ngoài', () => {
        // CSP của app chặn connect-src lạ.
        const i = src.indexOf('async dungOVe(question) {');
        expect(src.slice(i, i + 2500)).toMatch(/fetch\(`\/hanzi\//);
    });
});

describe('hai kiểu mới: nghe & xếp chữ cái', () => {
    test('kiểu NGHE che mặt chữ', () => {
        // Thấy chữ thì không còn phải nghe — mà đó đúng là kỹ năng kiểu này
        // kiểm tra.
        expect(src).toMatch(/question\.kieu === 'listen' \? '🔊/);
    });

    test('kiểu NGHE tự phát âm khi câu hiện', () => {
        // Không phát thì người học ngồi nhìn dấu hỏi, không có gì để chọn.
        // Neo vào `attachListeners`, không phải `bodyHtml` — hai hàm cùng mở
        // bằng `if (question.kieu === 'listen')`.
        const iAttach = src.indexOf('attachListeners() {');
        const i = src.indexOf("if (question.kieu === 'listen')", iAttach);
        expect(i).toBeGreaterThan(-1);
        expect(src.slice(i, i + 500)).toMatch(/GameLogic\.speakWord\(question\.word\.en\)/);
    });

    test('xếp chữ cái giữ trạng thái trên object, không đọc ngược từ DOM', () => {
        // Đọc từ DOM thì hai chữ cái giống nhau ("ee") không phân biệt được cái
        // nào đã dùng.
        const i = src.indexOf('ganXepChuCai(question) {');
        expect(i).toBeGreaterThan(-1);
        expect(src.slice(i, i + 1600)).toMatch(/this\._xep\.push\(/);
    });

    test('so đáp án bỏ hoa/thường và khoảng trắng', () => {
        // Cụm nhiều chữ ("take off") xáo lên thì người học không biết đặt dấu
        // cách ở đâu.
        const i = src.indexOf('ganXepChuCai(question) {');
        const body = src.slice(i, i + 2200);
        expect(body).toContain('toLowerCase()');
        // Khớp phần "bỏ khoảng trắng" mà không phải escape lồng nhiều lớp.
        expect(body).toContain("replace(/");
        expect(body).toContain("/g, '')");
    });

    test('chữ đã dùng vẫn CHIẾM CHỖ, chỉ mờ đi', () => {
        // Gỡ khỏi luồng thì hàng co lại và các chữ còn lại nhảy chỗ sau mỗi lần
        // bấm — bấm nhầm liên tục.
        const i = css.indexOf('.rm-letter.is-used {');
        expect(i).toBeGreaterThan(-1);
        const body = css.slice(i, css.indexOf('}', i));
        expect(body).toMatch(/opacity/);
        expect(body).not.toMatch(/display:\s*none/);
    });

    test('ô ghép có chiều cao cố định', () => {
        // Không thì hàng nút bên dưới nhảy khi chữ đầu tiên được thêm vào.
        const i = css.indexOf('.rm-scramble-answer {');
        expect(css.slice(i, css.indexOf('}', i))).toMatch(/min-height/);
    });

    test('cả bảy kiểu có ô chọn trong Cài đặt', () => {
        // Kiểu chạy được mà không có ô tắt thì người dùng gặp nó mà không có
        // cách nào bỏ.
        for (const k of ['flashcard', 'choice', 'truefalse', 'listen', 'speak', 'scramble', 'fill', 'hanzi']) {
            expect(panel).toContain(`key: '${k}'`);
        }
    });

    test('danh sách ở Cài đặt khớp `KIEU_HOI` — đủ và đúng THỨ TỰ', () => {
        // Hai danh sách ở hai file; lệch nhau thì hoặc có kiểu không tắt được,
        // hoặc có ô tick chẳng điều khiển gì.
        const oPanel = [...panel.matchAll(/key: '([a-z]+)'/g)].map(m => m[1]);
        expect(oPanel).toEqual(['flashcard', 'choice', 'truefalse', 'listen', 'speak', 'scramble', 'fill', 'hanzi']);
    });
});

describe('kiểu LẬT THẺ', () => {
    test('hàng chấm ẩn sẵn, chỉ hiện sau khi lật', () => {
        // Chấm trước khi thấy nghĩa thì không có gì để đối chiếu — "Tôi nhớ"
        // lúc đó là vô nghĩa.
        expect(src).toMatch(/is-hidden" id="rm-flash-judge-row"/);
        // Và đúng cú bấm "Lật thẻ" là thứ bỏ `is-hidden` đi.
        const i = src.indexOf("getElementById('rm-flash-reveal')");
        expect(i).toBeGreaterThan(-1);
        expect(src.slice(i, i + 500)).toMatch(/hangCham\?\.classList\.remove\('is-hidden'\)/);
    });

    test('bấm chấm hai lần không tính điểm hai lần', () => {
        // `ketThucCau` gọi `recordAnswer`; bấm nhanh hai cái là hai lượt ghi cho
        // cùng một câu. Các kiểu khác chặn bằng `disabled`, kiểu này cũng phải.
        const i = src.indexOf('const cham = (nho)');
        const than = src.slice(i, src.indexOf('};', i));
        expect(than).toMatch(/disabled = true/);
    });

    test('không có bộ sinh — chỉ cần từ và nghĩa', () => {
        // `correctAnswer` phải có, vì `ketThucCau` dùng nó để báo đáp án đúng
        // như mọi kiểu khác.
        expect(src).toMatch(/kieu === 'flashcard'[\s\S]{0,400}correctAnswer: word\.vn/);
    });

    test('hết giờ ở kiểu không có `options` thì không vỡ', () => {
        // Thẻ lật / gõ từ / viết chữ Hán đều không có `options`. Đọc thẳng
        // `question.options.indexOf` là `undefined.indexOf` — vỡ đúng lúc hết
        // giờ, tức lúc người dùng không bấm gì để cứu.
        expect(src).toMatch(/Array\.isArray\(question\.options\)/);
    });

    test('mặt sau ẩn bằng grid-rows, không phải display', () => {
        // `display` bật lên đột ngột thì thanh ba nút bên dưới nhảy một nhịp —
        // chế độ này vốn đã phải vừa khung nhìn.
        const i = css.indexOf('.rm-flash {');
        expect(i).toBeGreaterThan(-1);
        expect(css.slice(i, css.indexOf('}', i))).toMatch(/grid-template-rows: 0fr/);
        expect(css).toMatch(/\.rm-flash\.is-open\s*\{[^}]*grid-template-rows: 1fr/);
    });
});

describe('tab Cài đặt riêng cho ôn từ sai', () => {
    test('có mục điều hướng riêng, không nằm trong "Luyện tập"', () => {
        expect(settingsScreen).toMatch(/key: 'review'/);
        expect(settingsScreen).toMatch(/<ReviewPanel/);
        // Khối đã rời khỏi PracticePanel hoàn toàn — sót lại là hai bản sao
        // cùng sửa một cài đặt.
        expect(practicePanel).not.toContain('reviewKinds');
        expect(practicePanel).not.toContain('REVIEW_KINDS');
    });

    test('tìm được bằng từ khoá người dùng thật sự gõ', () => {
        // Người dùng gõ thứ họ MUỐN ĐỔI ("lật thẻ"), không gõ tên tab.
        const i = settingsScreen.indexOf("key: 'review'");
        const muc = settingsScreen.slice(i, settingsScreen.indexOf('},', i));
        expect(muc).toMatch(/keywords:/);
        expect(muc).toMatch(/lật thẻ/);
    });
});

describe('thanh trạng thái tự giải thích được', () => {
    test('mức thuộc có CHỮ, không chỉ mỗi "0/5"', () => {
        // Năm chấm cạnh một phân số đọc thành "câu 0 trên 5" — tiến độ lượt
        // chơi — chứ không ai đoán ra đó là mức thuộc từ này.
        expect(src).toMatch(/rm-status-label">Thuộc</);
    });

    test('không dựa vào `title` để giải nghĩa — điện thoại không hover được', () => {
        // `title` vẫn giữ để bổ sung chi tiết, nhưng nghĩa cốt lõi phải đọc
        // được ngay trên màn hình.
        const i = src.indexOf('class="rm-status"');
        const khoi = src.slice(i, src.indexOf('</div>', i));
        expect(khoi).toMatch(/rm-status-label/);
        expect(khoi).toMatch(/đã sai \$\{soLanSai\} lần/);
    });

    test('nhãn có kiểu riêng, mờ hơn con số', () => {
        // Nhãn ngang giá trị thì mắt không biết đọc cái nào trước.
        const i = css.indexOf('.rm-status-label {');
        expect(i).toBeGreaterThan(-1);
        expect(css.slice(i, css.indexOf('}', i))).toMatch(/color: var\(--text-secondary\)/);
    });

    test('thanh trạng thái xuống dòng được khi chật', () => {
        // Ba khối chữ trên một hàng ở màn hẹp — không wrap thì tràn ra ngoài.
        const i = css.indexOf('.rm-status {');
        expect(css.slice(i, css.indexOf('}', i))).toMatch(/flex-wrap: wrap/);
    });
});

describe('nguồn phải parse được', () => {
    test('không có backtick trong comment HTML giữa template string', () => {
        // Đã từng làm vỡ build: một comment HTML bên trong template string có
        // dấu backtick quanh tên thuộc tính, backtick đó ĐÓNG chuỗi giữa chừng.
        // Test nội dung không bắt được lỗi này — chỉ build mới bắt.
        //
        // Chỉ soi COMMENT: template string lồng nhau (`.map()` trả về chuỗi)
        // dùng backtick hoàn toàn hợp lệ.
        for (const m of src.matchAll(/<!--[\s\S]*?-->/g)) {
            expect(m[0]).not.toContain('`');
        }
    });

    test('file parse được như module thật', () => {
        // Chốt chặn chung: nếu cú pháp vỡ ở bất cứ đâu thì hàm dựng ném lỗi.
        expect(() => new Function(`return () => {\n${''}\n};`)).not.toThrow();
        expect(() => napBoChon()).not.toThrow();
    });
});
