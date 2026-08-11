/**
 * MỌI chế độ luyện tập phải xử lý trường hợp "không có câu hỏi nào".
 *
 * Lỗi đã gặp (pronunciationMode, sentenceBuilder):
 *
 *     if (this.questions.length > 0) {
 *         this.showQuestion();
 *     }
 *
 * Không có `else`. Không từ nào thì không render gì, không báo gì, không thoát
 * — màn hình trắng trơn, console sạch, người dùng ngồi nhìn không hiểu chuyện
 * gì. Đây là hình dạng "hỏng im lặng" đã xuất hiện lần thứ bảy trong dự án:
 * một nhánh phòng thủ viết quá gọn biến sự cố thành trạng thái trông như bình
 * thường.
 *
 * Vá hai file thì lần thứ ba vẫn tái phạm, nên test này QUÉT NGUỒN: chế độ nào
 * kiểm `questions.length` để quyết định render thì phải có nhánh xử lý rỗng.
 *
 * Nhận diện nhánh xử lý rỗng = gọi PracticeManager.complete() hoặc
 * exitPractice() — tức là có lối thoát khỏi màn hình, không đứng im.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODES_DIR = dirname(fileURLToPath(import.meta.url));

/** Bỏ comment trước khi quét — không thì chính đoạn mô tả lỗi ở đầu file này
 *  khớp regex và test xanh giả. Đã dính bẫy đó nhiều lần. */
function stripComments(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
}

const modeFiles = readdirSync(MODES_DIR)
    .filter(f => f.endsWith('.js') && !f.endsWith('.test.js'));

describe('mọi chế độ đều thoát êm khi không có câu hỏi', () => {

    test('có chế độ để quét — thư mục rỗng thì test này vô nghĩa', () => {
        expect(modeFiles.length).toBeGreaterThan(10);
    });

    /**
     * Bắt ĐÚNG mẫu hỏng thay vì hỏi "file này có lối thoát nào không".
     *
     * Bản đầu của test này kiểm cả file: `questions.length` có xuất hiện thì
     * phải có `PracticeManager.complete()` ở đâu đó. Xanh giả ngay lập tức —
     * pronunciationMode đã gọi `exitPractice()` ở nhánh "trình duyệt không hỗ
     * trợ", hoàn toàn không liên quan, mà vẫn thoả điều kiện. Đảo chiều mới lòi
     * ra: trả lại lỗi cũ thì test vẫn xanh.
     *
     * Mẫu hỏng cụ thể là `if (questions.length > 0) { showQuestion() }` — rẽ
     * nhánh theo số câu hỏi mà nhánh rỗng không làm gì cả.
     */
    const BROKEN = /if\s*\(\s*this\.questions\.length\s*>\s*0\s*\)\s*\{[^}]*\}\s*(?!\s*else)/;

    test.each(modeFiles)('%s — không bỏ mặc màn hình trắng', (file) => {
        const src = stripComments(readFileSync(join(MODES_DIR, file), 'utf8'));
        expect(BROKEN.test(src)).toBe(false);
    });

    test('tự kiểm: mẫu hỏng PHẢI bị bắt, mẫu đúng PHẢI lọt', () => {
        // Không có case này thì test trên xanh kể cả khi regex sai hoàn toàn.
        const broken = `
            await this.generateQuestions();
            if (this.questions.length > 0) { this.showQuestion(); }
        `;
        const fixed = `
            await this.generateQuestions();
            if (this.questions.length === 0) {
                PracticeManager.complete();
                return;
            }
            this.showQuestion();
        `;
        expect(BROKEN.test(stripComments(broken))).toBe(true);
        expect(BROKEN.test(stripComments(fixed))).toBe(false);
    });
});

/**
 * Nguồn từ vựng phải tôn trọng chủ đề đang chọn.
 *
 * `GameLogic.getRandomWords()` đọc thẳng `vocabularyData`, KHÔNG biết tới bộ chủ
 * đề người dùng chọn. Chọn 动物 rồi vào luyện phát âm thì ra từ chủ đề khác —
 * hoặc không ra từ nào — mà không có dấu hiệu nào báo bộ lọc đã bị bỏ qua.
 * 15/17 chế độ đã chuyển sang PartSelector; hai chế độ còn sót là
 * pronunciationMode và sentenceBuilder.
 */
describe('chế độ luyện tập lấy từ qua PartSelector', () => {
    test.each(modeFiles)('%s — không dùng getRandomWords để sinh câu hỏi', (file) => {
        const src = stripComments(readFileSync(join(MODES_DIR, file), 'utf8'));
        expect(src).not.toMatch(/GameLogic\.getRandomWords\s*\(/);
    });
});
