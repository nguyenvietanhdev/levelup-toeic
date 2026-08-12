/**
 * Từ lưu qua Dịch nhanh phải vào kho THEO NGÔN NGỮ.
 *
 * Trước đây mọi từ đổ chung vào source 'dich-nhanh' / part 'DICH-NHANH'. Mà
 * luyện tập lọc theo `part` (practiceManager.js:76) — nên chọn Part đó lúc đang
 * học tiếng Anh sẽ ra lẫn chữ Hán, và ngược lại. Không có lỗi nào, chỉ là bài
 * luyện tiếng Anh bỗng hiện `这是谁`.
 *
 * Trường `lang` thêm trước đó KHÔNG giải quyết được việc này: nó chỉ chọn được
 * giọng đọc, còn bộ lọc luyện tập không nhìn tới nó.
 *
 * Kiểm dữ liệu thật lúc sửa: 20/21 bản ghi trong kho cũ là chữ Hán, chỉ 1 từ
 * Latin — nên đã chuyển 20 từ đó sang kho riêng bằng scripts/splitDichNhanhByLang.js.
 */
import { describe, test, expect } from 'vitest';

/** Bản sao quy tắc chọn kho trong TranslateModal.handleSaveVocab. */
function targetStore(savedLang) {
    const isZh = savedLang === 'zh';
    return {
        source: isZh ? 'dich-nhanh-zh' : 'dich-nhanh',
        part: isZh ? 'DICH-NHANH-ZH' : 'DICH-NHANH',
    };
}

describe('chọn kho theo ngôn ngữ', () => {
    test('tiếng Trung vào kho riêng', () => {
        expect(targetStore('zh')).toEqual({ source: 'dich-nhanh-zh', part: 'DICH-NHANH-ZH' });
    });

    test('tiếng Anh giữ kho cũ — bản ghi cũ không mồ côi', () => {
        expect(targetStore('en')).toEqual({ source: 'dich-nhanh', part: 'DICH-NHANH' });
    });

    test('hai ngôn ngữ KHÔNG dùng chung part — đây là điều kiện để lọc đúng', () => {
        expect(targetStore('zh').part).not.toBe(targetStore('en').part);
    });

    test('giá trị lang lạ rơi về tiếng Anh, không tạo kho thứ ba', () => {
        expect(targetStore('fr').source).toBe('dich-nhanh');
        expect(targetStore(undefined).source).toBe('dich-nhanh');
    });
});

/**
 * Chốt bằng NGUỒN THẬT.
 *
 * Phần trên chép lại quy tắc nên chỉ chứng minh quy tắc tự nhất quán — sửa
 * TranslateModal về dùng chung một kho thì nó vẫn xanh. Quét file thật mới bắt
 * được điều đó.
 */
describe('TranslateModal thực sự tách kho', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs
        .readFileSync(path.join(__dirname, 'TranslateModal.jsx'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n').filter(l => !/^\s*\/\//.test(l) && !/^\s*\*/.test(l)).join('\n');

    test('có nhánh chọn kho theo ngôn ngữ', () => {
        expect(src).toMatch(/dich-nhanh-zh/);
        expect(src).toMatch(/DICH-NHANH-ZH/);
    });

    test('KHÔNG còn gán cứng source/part cho mọi từ', () => {
        // Đây là hình dạng cũ đã gây lỗi.
        expect(src).not.toMatch(/source:\s*['"]dich-nhanh['"]\s*,/);
        expect(src).not.toMatch(/part:\s*['"]DICH-NHANH['"]\s*,/);
    });
});
