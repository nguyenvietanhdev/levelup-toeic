/**
 * Tách từ ghép thành chữ Hán đơn — bước đầu tiên của chế độ luyện viết.
 *
 * Vì sao đáng test riêng: luyện viết `你好` không có nghĩa, phải luyện `你` rồi
 * `好`. Mà dữ liệu thật lẫn nhiều thứ không phải chữ Hán — dấu câu Trung
 * (，。！), chữ Latin trong ví dụ, khoảng trắng. Lọt một ký tự không phải Hán là
 * `fetch('/hanzi/，.json')` trả 404 và màn hình trắng.
 */
import { describe, test, expect } from 'vitest';
import { splitHanzi } from './hanziWriting.js';

describe('splitHanzi', () => {
    test('tách từ ghép thành từng chữ', () => {
        expect(splitHanzi('你好')).toEqual(['你', '好']);
        expect(splitHanzi('早上好')).toEqual(['早', '上', '好']);
    });

    test('chữ đơn giữ nguyên', () => {
        expect(splitHanzi('好')).toEqual(['好']);
    });

    test('LOẠI dấu câu Trung — nếu lọt sẽ tải file không tồn tại', () => {
        // Câu ví dụ trong DB có dạng "你好，我是越南人。"
        expect(splitHanzi('你好，我是越南人。')).toEqual(
            ['你', '好', '我', '是', '越', '南', '人']
        );
    });

    test('LOẠI chữ Latin, số và khoảng trắng', () => {
        expect(splitHanzi('好 good 123')).toEqual(['好']);
        expect(splitHanzi('HSK1 学')).toEqual(['学']);
    });

    test('đầu vào rỗng hoặc không hợp lệ trả mảng rỗng, không ném lỗi', () => {
        expect(splitHanzi('')).toEqual([]);
        expect(splitHanzi(null)).toEqual([]);
        expect(splitHanzi(undefined)).toEqual([]);
        expect(splitHanzi('abc')).toEqual([]);
    });

    test('giữ nguyên thứ tự xuất hiện', () => {
        // Thứ tự quan trọng: người học viết theo thứ tự chữ trong từ.
        expect(splitHanzi('中国人')).toEqual(['中', '国', '人']);
    });
});
