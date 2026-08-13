/**
 * Ngôn ngữ nhận diện giọng nói phải theo NGÔN NGỮ NGUỒN người dùng chọn.
 *
 * Popup Dịch nhanh có ô "Dịch từ" riêng. Trước đây thu âm trong popup lại dùng
 * `getVocabLang()` — ngôn ngữ đang HỌC. Đang học tiếng Anh mà chọn dịch từ 中文
 * thì bộ nhận diện vẫn nghe tiếng Anh và trả ra chữ Latin, không ai hiểu vì sao.
 *
 * Hai chỗ dễ hỏng im lặng:
 *   1. Dùng thẳng `speechLangFor(srcLang)` — hàm đó chỉ biết 'en'/'zh', truyền
 *      'vi' vào sẽ ra 'en-US' mà không báo gì.
 *   2. Không tính tới 'zh-CN'/'zh-TW': so khớp nguyên chuỗi thì cả hai đều trượt
 *      và rơi về tiếng Anh.
 */
import { describe, test, expect } from 'vitest';
import { speechLangFor, speechLangForSource } from './speechInput.js';

describe('speechLangForSource', () => {
    test('mã có phần vùng: lấy phần gốc', () => {
        // 'zh-CN' và 'zh-TW' đều là tiếng Trung.
        expect(speechLangForSource('zh-CN')).toBe('zh-CN');
        expect(speechLangForSource('zh-TW')).toBe('zh-CN');
    });

    test('tiếng Việt KHÔNG rơi về tiếng Anh', () => {
        // Đây là ca mà `speechLangFor` cũ trả sai.
        expect(speechLangForSource('vi')).toBe('vi-VN');
        expect(speechLangFor('vi')).toBe('en-US');   // chứng minh hàm cũ sai ở đâu
    });

    test('các ngôn ngữ app có dùng', () => {
        expect(speechLangForSource('en')).toBe('en-US');
        expect(speechLangForSource('ja')).toBe('ja-JP');
        expect(speechLangForSource('ko')).toBe('ko-KR');
    });

    test('`auto` dùng giá trị dự phòng người gọi đưa', () => {
        // Web Speech không có chế độ đa ngôn ngữ thật, nên "tự phát hiện" phải
        // quy về một mã cụ thể — lấy ngôn ngữ đang học là đoán tốt nhất.
        expect(speechLangForSource('auto', 'zh-CN')).toBe('zh-CN');
        expect(speechLangForSource('auto')).toBe('en-US');
    });

    test('mã lạ / rỗng cũng về dự phòng, không ném lỗi', () => {
        expect(speechLangForSource('xx-YY', 'zh-CN')).toBe('zh-CN');
        expect(speechLangForSource('')).toBe('en-US');
        expect(speechLangForSource(null)).toBe('en-US');
        expect(speechLangForSource(undefined)).toBe('en-US');
    });

    test('không phân biệt hoa thường', () => {
        expect(speechLangForSource('ZH-cn')).toBe('zh-CN');
    });
});
