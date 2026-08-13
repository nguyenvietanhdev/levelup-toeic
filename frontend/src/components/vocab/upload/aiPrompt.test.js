/**
 * Prompt cho AI (tab "Thêm JSON") phải theo ĐÚNG ngôn ngữ đang học.
 *
 * Bản cũ cứng tiếng Anh: "từ tiếng anh", "phiên âm IPA", "câu ví dụ bằng tiếng
 * anh". Người học tiếng Trung dán danh sách chữ Hán vào thì AI trả JSON có
 * `phonetic` là IPA và ví dụ tiếng Anh — sai kiểu dữ liệu ngay từ nguồn, mà chỉ
 * phát hiện ra sau khi đã nhập cả trăm từ.
 *
 * `lang` cũng phải nằm trong prompt VÀ được đường nhập giữ lại. Nó quyết định
 * giọng đọc; thiếu thì mọi từ Hán mặc định 'en' và đọc bằng giọng Anh.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeVocabItem } from '@/services/vocabUpload.js';

const src = readFileSync(join(__dirname, 'openUploadModal.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

describe('prompt theo ngôn ngữ', () => {
    test('rẽ nhánh theo getVocabLang, không cứng tiếng Anh', () => {
        expect(src).toMatch(/getVocabLang\(\) === 'zh'/);
    });

    test('tiếng Trung yêu cầu PINYIN có dấu thanh, không phải IPA', () => {
        // Đây là chỗ sai nặng nhất của bản cũ: pinyin và IPA là hai hệ khác hẳn.
        expect(src).toMatch(/pinyin CÓ DẤU THANH/);
        expect(src).toMatch(/KHÔNG phải IPA/);
    });

    test('tiếng Trung dặn GIỮ NGUYÊN chữ Hán, không phiên âm sang Latin', () => {
        expect(src).toMatch(/KHÔNG phiên âm sang chữ Latin/);
    });

    test('level theo hệ HSK khi học tiếng Trung', () => {
        // A1/B2 là khung châu Âu, không dùng cho tiếng Trung.
        expect(src).toMatch(/HSK1 \/ HSK2/);
    });

    test('prompt có trường `lang` và ghim đúng giá trị', () => {
        expect(src).toMatch(/"lang": "\$\{langValue\}"/);
        expect(src).toMatch(/langValue = isZh \? 'zh' : 'en'/);
    });
});

describe('checkbox đường dẫn ảnh', () => {
    test('có checkbox trong giao diện', () => {
        expect(src).toMatch(/id="json-with-image"/);
    });

    test('bỏ chọn thì DẶN AI để trống, không chỉ bỏ dòng đi', () => {
        // Bỏ dòng `image` mà không dặn gì thì AI vẫn tự thêm đường dẫn bịa.
        expect(src).toMatch(/LUÔN để chuỗi rỗng ""/);
    });

    test('chọn thì mới có mẫu đường dẫn', () => {
        expect(src).toMatch(/withImage[\s\S]{0,200}images\/pages\//);
    });
});

describe('đường nhập JSON giữ lại `lang`', () => {
    test('nhận `lang` từ JSON', () => {
        // Prompt yêu cầu AI trả về trường này; không nhận ở đây là hứa suông.
        expect(normalizeVocabItem({ en: 'hello', lang: 'en' }).lang).toBe('en');
        expect(normalizeVocabItem({ en: '你好', lang: 'zh' }).lang).toBe('zh');
    });

    test('JSON CŨ không có `lang` thì đoán theo mặt chữ', () => {
        // File viết trước khi có trường này vẫn phải đọc đúng giọng.
        expect(normalizeVocabItem({ en: '你好' }).lang).toBe('zh');
        expect(normalizeVocabItem({ en: 'hello' }).lang).toBe('en');
    });

    test('giá trị lạ rơi về đoán mặt chữ, không nhận bừa', () => {
        expect(normalizeVocabItem({ en: '你好', lang: 'fr' }).lang).toBe('zh');
        expect(normalizeVocabItem({ en: 'hello', lang: 123 }).lang).toBe('en');
    });

    test('en rỗng không ném lỗi', () => {
        expect(() => normalizeVocabItem({})).not.toThrow();
        expect(normalizeVocabItem({}).lang).toBe('en');
    });
});
