/**
 * Khối câu ví dụ: câu + nút Dịch + nút Nghe + phiên âm.
 *
 * Rà soát trước khi sửa cho ra con số: 12 chế độ hiện câu ví dụ, chỉ 2 có đủ
 * nút dịch và phiên âm. Mười chế độ còn lại hiện câu tiếng Anh trần — người học
 * đọc được mặt chữ nhưng không hiểu nghĩa và không biết đọc thế nào, mà câu ví
 * dụ vốn là chỗ dạy CÁCH DÙNG từ, tức chỗ cần hiểu nhất.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODES = join(__dirname, 'modes');
const doc = (f) => readFileSync(join(MODES, f), 'utf8');
const lib = readFileSync(join(__dirname, 'exampleBlock.js'), 'utf8');

describe('module dùng chung', () => {
    test('nút DỊCH đứng trước nút NGHE', () => {
        // Đọc hiểu rồi mới nghe — cùng thứ tự ở mọi chế độ, để tay quen một chỗ
        // là quen mọi chỗ.
        expect(lib.indexOf('-tr"')).toBeLessThan(lib.indexOf('-sp"'));
    });

    test('chặn nổi bọt trên cả hai nút', () => {
        // Khối này nằm trong vùng đã có handler (thẻ lật, ô chọn đáp án); không
        // chặn thì một cú bấm chạy hai việc.
        expect(lib.split('e.stopPropagation()').length - 1).toBe(2);
    });

    test('KHÔNG truyền ngôn ngữ cho `speakWord`', () => {
        // Nó tự nhận chữ Hán và đổi sang zh-CN. Truyền cứng 'en-US' là đọc câu
        // tiếng Trung bằng giọng tiếng Anh.
        expect(lib).toMatch(/GameLogic\.speakWord\(text\)/);
        expect(lib).not.toMatch(/speakWord\(text, ['"]en/);
    });

    test('phiên âm dùng hàm CHUNG cho cả hai ngôn ngữ', () => {
        // `layPinyinCau` chỉ phục vụ tiếng Trung — dùng nó thì câu tiếng Anh
        // không bao giờ có phiên âm.
        expect(lib).toMatch(/layPhienAmCau/);
        expect(lib).not.toMatch(/layPinyinCau/);
    });

    test('KHÔNG `await` phiên âm — không chặn câu hỏi', () => {
        expect(lib).toMatch(/layPhienAmCau\(text\)\.then\(/);
        expect(lib).not.toMatch(/await layPhienAmCau/);
    });

    test('bỏ kết quả nếu đã sang câu khác', () => {
        // Bấm "Tiếp" nhanh hơn mạng thì phiên âm câu trước hiện dưới câu sau.
        expect(lib).toMatch(/modeObj\.currentIndex !== idxLucGoi/);
    });

    test('câu rỗng → trả rỗng, nơi gọi khỏi tự kiểm', () => {
        expect(lib).toMatch(/if \(!text\) return \{ html: '', id: '' \}/);
    });

    test('mỗi khối có id RIÊNG', () => {
        // Một màn có thể hiện nhiều câu ví dụ; id trùng thì nút của khối này
        // điều khiển khối kia.
        expect(lib).toMatch(/\+\+_dem/);
    });
});

describe('các chế độ đã dùng khối chung', () => {
    const DA_DUNG = [
        'synonymCheck.js', 'wordTypeCheck.js', 'contextLearning.js',
        'reviewMistakes.js', 'phoneticQuiz.js', 'listening.js',
    ];

    for (const f of DA_DUNG) {
        test(`${f.replace('.js', '')} import từ exampleBlock`, () => {
            expect(doc(f)).toMatch(/from '\.\.\/exampleBlock\.js'/);
        });
    }

    test('không còn khuôn chép tay cũ ở khối THÔNG TIN THÊM', () => {
        // `speak-example-btn` là id của bản chép tay cũ — nút loa đơn độc, không
        // dịch, không phiên âm. Còn nó ở khối thông tin thêm nghĩa là chế độ đó
        // chưa chuyển.
        //
        // NGOẠI LỆ `contextLearning`: nó còn một nút cùng id ở phần ĐỀ BÀI
        // ("Hãy nghe và đoán nghĩa") — đó là cơ chế của chế độ, không phải khối
        // thông tin thêm, và phải giữ.
        for (const f of DA_DUNG.filter((x) => x !== 'contextLearning.js')) {
            expect(`${f}:${doc(f)}`).not.toMatch(/speak-example-btn/);
        }
    });

    test('contextLearning giữ nút nghe của ĐỀ BÀI, thêm khối chung ở kết quả', () => {
        const src = doc('contextLearning.js');
        // Nút đề bài vẫn còn — nó là cách người học nghe để đoán.
        expect(src).toMatch(/id="speak-example-btn" title="Nghe lại câu ví dụ"/);
        // Và khối chung chỉ chèn trong `showWordInfo`, tức SAU khi đã trả lời:
        // hiện nút dịch ngay từ đầu là đưa luôn đáp án.
        const i = src.indexOf('showWordInfo(word)');
        expect(src.slice(i)).toMatch(/chenViDu\(/);
    });
});

describe('ngoại lệ có lý do', () => {
    /**
     * Hai chế độ KHÔNG dùng khối chung, và lý do:
     *   · `dictation` — câu ví dụ là ĐỀ BÀI (nghe rồi gõ lại). Thêm nút dịch
     *     hay nút nghe là đưa luôn đáp án.
     *   · `pronunciationMode` — có phần đọc cả câu riêng với chấm từng từ.
     *
     * `exampleFillBlank` TỪNG được miễn vì cùng lý do "câu là đề bài". Nay nó
     * dùng khối chung, nhưng chỉ ở nhánh CHẤM BÀI — lúc đó chỗ trống đã điền
     * đáp án nên không còn gì để lộ. Ca dưới chốt đúng ràng buộc đó.
     */
    const MIEN = ['dictation.js', 'pronunciationMode.js'];

    for (const f of MIEN) {
        test(`${f.replace('.js', '')} KHÔNG thêm nút dịch cho đề bài`, () => {
            expect(doc(f)).not.toMatch(/from '\.\.\/exampleBlock\.js'/);
        });
    }
});

describe('exampleFillBlank: nút nghe chỉ hiện SAU khi trả lời', () => {
    test('chèn ở nhánh chấm bài, không phải lúc dựng đề', () => {
        // Câu ví dụ ở chế độ này LÀ đề bài (có chỗ trống). Chèn nút nghe lúc
        // dựng đề là đọc luôn đáp án ra loa.
        const src = doc('exampleFillBlank.js');
        const iDapAn = src.indexOf('filled-answer');
        const iChen = src.indexOf('chenViDu(');
        expect(iDapAn).toBeGreaterThan(-1);
        expect(iChen).toBeGreaterThan(iDapAn);
    });
});

describe('không bỏ sót chế độ nào', () => {
    test('mọi chế độ hiện câu ví dụ đều có dịch + phiên âm, hoặc được miễn', () => {
        // Chốt chặn cho chế độ THÊM SAU: hiện câu ví dụ mà quên nút thì ca này
        // đỏ ngay, thay vì đợi người dùng phát hiện.
        const MIEN = new Set([
            'dictation.js',           // câu là đề bài

            'pronunciationMode.js',   // có phần đọc câu riêng
            'flashcard.js',           // đã có bản riêng cho ví dụ + đồng nghĩa
            'multipleChoice.js',      // bản gốc, đầy đủ
            'sentenceBuilder.js',     // nút gắn ở khối kết quả
        ]);

        const thieu = readdirSync(MODES)
            .filter((f) => f.endsWith('.js') && !f.includes('.test.'))
            .filter((f) => !MIEN.has(f))
            .filter((f) => /word\.example/.test(doc(f)))
            .filter((f) => !doc(f).includes('exampleBlock'));

        expect(thieu).toEqual([]);
    });
});
