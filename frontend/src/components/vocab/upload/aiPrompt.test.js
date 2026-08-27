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
        expect(src).toMatch(/const khoHienTai = getVocabLang\(\)/);
        // Kho song ngữ dùng chữ Hán làm mặt chính nên mọi quy tắc về chữ Hán
        // (pinyin, từ loại 名词, khung HSK) đều áp dụng cho nó.
        expect(src).toMatch(/isZh = khoHienTai === 'zh' \|\| isBi/);
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
        // Kho zh có cả mức cao nhất — thiếu thì AI không biết dùng gì cho từ khó.
        expect(src).toMatch(/HSK7-9/);
    });

    test('dặn RÕ không được rơi về A1/B2 cho tiếng Trung', () => {
        // AI thường mặc định trả CEFR cho MỌI ngôn ngữ nếu không cấm thẳng.
        expect(src).toMatch(/KHÔNG dùng A1\/B2\/C1/);
    });

    test('có bảng quy đổi CEFR → HSK để AI tự chuyển', () => {
        // AI có thể chỉ biết mức theo khung châu Âu; cho bảng quy đổi thì nó
        // chuyển được thay vì ghi bừa hoặc bỏ trống.
        expect(src).toMatch(/A1→HSK1/);
        expect(src).toMatch(/C2→HSK7-9/);
    });

    test('tiếng Anh vẫn dùng CEFR', () => {
        // Chỉ tiếng Trung đổi sang HSK; kho en giữ nguyên khung châu Âu.
        expect(src).toMatch(/Dùng khung CEFR/);
    });

    test('TỪ LOẠI theo ngôn ngữ — zh dùng chữ Hán', () => {
        // Kho zh lưu `名词`/`动词` (11.783/12.266 từ). Để AI trả `noun` thì từ
        // mới nằm riêng một mục, lọc `名词` bỏ sót.
        expect(src).toMatch(/const typeLabel = isZh/);
        expect(src).toMatch(/名词 \/ 动词 \/ 形容词/);
        expect(src).toMatch(/viết BẰNG CHỮ HÁN \(名词, 动词, 形容词…\), KHÔNG dùng noun\/verb/);
    });

    test('dặn cách nối từ loại ghép — tránh sinh lại biến thể', () => {
        // Kho từng có `动词/名词` lẫn `动词 / 名词` là hai mục cho cùng một loại.
        expect(src).toMatch(/nối bằng "\/" không có khoảng trắng: 名词\/动词/);
    });

    test('ĐỒNG NGHĨA phải cùng ngôn ngữ với từ', () => {
        // 74% từ người dùng tải lên đang thiếu `synonyms` — prompt cũ chỉ ghi
        // "viết thường", vô nghĩa với chữ Hán và không nói viết bằng gì.
        expect(src).toMatch(/const synonymsLabel = isZh/);
        expect(src).toMatch(/từ đồng nghĩa BẰNG CHỮ HÁN/);
        expect(src).toMatch(/KHÔNG dùng pinyin hay tiếng Việt/);
    });

    test('KHÔNG còn gộp type/synonyms vào quy tắc "viết thường" chung', () => {
        // Bản cũ: `"vn", "synonyms", "type", "source" → viết thường` — áp cho cả
        // hai ngôn ngữ, mà chữ Hán không có hoa/thường.
        expect(src).not.toMatch(/"vn", "synonyms", "type", "source" → viết thường/);
    });

    test('prompt có trường `lang` và ghim đúng giá trị', () => {
        expect(src).toMatch(/"lang": "\$\{langValue\}"/);
        // Ba kho: `bi` phải là giá trị RIÊNG, không mượn 'zh' — gộp nhãn thì
        // bộ từ riêng song ngữ lẫn vào danh sách của kho tiếng Trung.
        expect(src).toMatch(/langValue = isBi \? 'bi' : \(isZh \? 'zh' : 'en'\)/);
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

describe('form nhập tay theo đúng kho', () => {
    const form = readFileSync(join(__dirname, 'openUploadModal.js'), 'utf8');

    test('nhãn ô từ chính đổi theo kho, không cứng "English"', () => {
        // Người học tiếng Trung gõ chữ Hán vào ô ghi "English" — đúng chỗ
        // (backend lưu từ chính ở `en` cho mọi ngôn ngữ) nhưng nhìn như sai.
        expect(form).toMatch(/const nhanTuChinh = khoForm === 'en' \? 'English'/);
        expect(form).toMatch(/fieldHtml\('en', nhanTuChinh/);
    });

    test('bỏ `lowercase` với chữ Hán', () => {
        // `lowercase` vô nghĩa với chữ Hán, mà lại hạ chữ thường mất phần Latin
        // lẫn trong câu.
        expect(form).toMatch(/bienDoiTuChinh = khoForm === 'en' \? 'lowercase' : 'none'/);
    });

    test('kho song ngữ có thêm ô nghĩa tiếng Anh', () => {
        expect(form).toMatch(/khoForm === 'bi' \?[\s\S]{0,200}fieldHtml\('enMeaning'/);
    });

    test('ô đó KHÔNG hiện ở hai kho cũ', () => {
        // Hiện thừa một ô bắt buộc mà kho đó không dùng là chặn người ta lưu.
        const i = form.indexOf("fieldHtml('enMeaning'");
        const truoc = form.slice(Math.max(0, i - 250), i);
        expect(truoc).toMatch(/khoForm === 'bi'/);
    });

    test('CHẶN lưu khi bộ song ngữ thiếu nghĩa tiếng Anh', () => {
        // Thiếu thì từ đó không luyện được chiều Trung → Anh — nửa công dụng
        // biến mất mà không có lỗi nào.
        expect(form).toMatch(/khoForm === 'bi' && !enMeaning/);
    });

    test('gửi `enMeaning` lên server', () => {
        expect(form).toMatch(/normalizeVocabItem\(\{ en, vn:[^}]*enMeaning/);
    });

    test('SỬA từ thì đổ lại `enMeaning` vào ô', () => {
        // Không đổ lại thì mở ra sửa một chữ rồi lưu là ô rỗng ghi đè giá trị
        // cũ, im lặng.
        expect(form).toMatch(/set\('vocab-enMeaning', _editing\.enMeaning\)/);
    });

    test('dọn ô `enMeaning` cùng các ô khác', () => {
        // Sót lại thì từ sau thừa nghĩa của từ trước.
        const soLan = (form.match(/'vocab-enMeaning'/g) || []).length;
        expect(soLan).toBeGreaterThanOrEqual(4);   // khai + đọc + prefill + 2 chỗ dọn
    });
});

describe('`normalizeVocabItem` không nuốt dữ liệu kho song ngữ', () => {
    test('giữ `enMeaning`', () => {
        // Không liệt kê thì nó bị lọc mất trước cả khi tới server.
        expect(normalizeVocabItem({ en: '你好', enMeaning: 'Hello' }).enMeaning).toBe('hello');
    });

    test('`lang: bi` được giữ, KHÔNG bị đoán lại thành `zh`', () => {
        // Bộ song ngữ toàn chữ Hán nên nhánh đoán sẽ ép thành 'zh' — mất nhãn
        // riêng và lẫn vào danh sách bộ tiếng Trung.
        expect(normalizeVocabItem({ en: '你好', lang: 'bi' }).lang).toBe('bi');
    });

    test('vẫn đoán đúng khi KHÔNG có `lang`', () => {
        expect(normalizeVocabItem({ en: '你好' }).lang).toBe('zh');
        expect(normalizeVocabItem({ en: 'hello' }).lang).toBe('en');
    });
});
