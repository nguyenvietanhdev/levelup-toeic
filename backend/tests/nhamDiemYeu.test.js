/**
 * Tầng 2: AI ra bài nhắm vào lỗi ngữ pháp lặp lại trong hồ sơ người học.
 *
 * Chỗ dễ hỏng, đều im lặng:
 *   1. Lỗi đọc hồ sơ làm hỏng luôn việc ra bài (người học mất lượt vì một tính năng phụ).
 *   2. Chèn chỉ thị cho người học tiếng Trung (bộ phân loại lỗi chỉ dành cho tiếng Anh).
 *   3. Nhắm cả nhóm "chính tả / dấu câu" — không tạo cơ hội luyện được bằng nội dung.
 *   4. Hội thoại chỉ nhắm ở lượt mở, các lượt sau quên mất (replyTurn không nhận `nham`).
 *   5. Prompt dặn AI nêu tên lỗi → người học biết bài đang "soi" mình.
 */
let mockHoSo = { diemYeu: [] };
let mockLoi = false;
let mockSoLanGoi = 0;
jest.mock('../services/tienBo', () => ({
    layTienBo: async () => {
        mockSoLanGoi += 1;
        if (mockLoi) throw new Error('db down');
        return mockHoSo;
    },
}));

const mockMessages = [];
jest.mock('../config/openai', () => ({
    chatCompletion: async (messages) => {
        mockMessages.push(messages);
        return { success: true, content: '{"prompt":"Write about X","passage":"Xin chào.","topic":"t"}\nSCENARIO: s\nREPLY: Hi?' };
    },
}));

const { layNham, chiThiNham, locNhamDuoc, _xoaCache } = require('../services/nhamDiemYeu');
const { openConversation, replyTurn } = require('../services/conversationAi');
const { generatePrompt } = require('../services/essayGrader');
const { generatePassage } = require('../services/translationGrader');
const { readFileSync } = require('fs');
const { join } = require('path');

beforeEach(() => {
    _xoaCache();
    mockHoSo = { diemYeu: [] };
    mockLoi = false;
    mockSoLanGoi = 0;
    mockMessages.length = 0;
});

const he = () => mockMessages[mockMessages.length - 1][0].content;

describe('lọc điểm yếu nhắm được', () => {
    test('chỉ lỗi ngữ pháp có cách tạo cơ hội; tối đa 2; giữ thứ tự hay mắc nhất', () => {
        expect(locNhamDuoc([
            { loai: 'ngu-phap', key: 'spelling', vi: 'Chính tả' },
            { loai: 'ngu-phap', key: 'tense', vi: 'Thì' },
            { loai: 'ky-nang', key: 'nghe', vi: 'Nghe' },
            { loai: 'ngu-phap', key: 'article', vi: 'Mạo từ' },
            { loai: 'ngu-phap', key: 'preposition', vi: 'Giới từ' },
        ])).toEqual([{ key: 'tense', vi: 'Thì' }, { key: 'article', vi: 'Mạo từ' }]);
        expect(locNhamDuoc(null)).toEqual([]);
    });

    test('chỉ thị rỗng khi không có gì; không bảo AI nêu tên lỗi', () => {
        expect(chiThiNham([], 'viet')).toBe('');
        expect(chiThiNham(['spelling'], 'dich')).toBe('');
        for (const m of ['hoi-thoai', 'viet', 'dich']) {
            expect(chiThiNham(['tense'], m)).toMatch(/Never mention|without mentioning|Do not mention/);
        }
        // Hội thoại: chỉ thỉnh thoảng, không phải lượt nào cũng xoáy vào.
        expect(chiThiNham(['tense'], 'hoi-thoai')).toMatch(/not every turn/);
    });
});

describe('lấy từ hồ sơ', () => {
    test('đọc hồ sơ, cache theo người dùng (không tính lại mỗi lần ra bài)', async () => {
        mockHoSo = { diemYeu: [{ loai: 'ngu-phap', key: 'article', vi: 'Mạo từ' }] };
        expect(await layNham('u1', 'en')).toEqual([{ key: 'article', vi: 'Mạo từ' }]);
        await layNham('u1', 'en');
        expect(mockSoLanGoi).toBe(1);
    });

    test('tiếng Trung hoặc chưa đăng nhập → không nhắm, không đọc hồ sơ', async () => {
        expect(await layNham('u1', 'zh')).toEqual([]);
        expect(await layNham(null, 'en')).toEqual([]);
        expect(mockSoLanGoi).toBe(0);
    });

    test('lỗi đọc hồ sơ → [] chứ không ném', async () => {
        mockLoi = true;
        await expect(layNham('u2', 'en')).resolves.toEqual([]);
    });
});

describe('chèn vào prompt ra bài', () => {
    test('Hội thoại: cả lượt mở LẪN mỗi lượt đáp', async () => {
        await openConversation({ lang: 'en', targetWords: ['a'], nham: ['tense'] });
        expect(he()).toMatch(/often makes mistakes with: talking about both past events/);
        await replyTurn({ lang: 'en', targetWords: ['a'], turns: [], nham: ['tense'] });
        expect(he()).toMatch(/often makes mistakes with/);
        await replyTurn({ lang: 'en', targetWords: ['a'], turns: [] });
        expect(he()).not.toMatch(/often makes mistakes/);
    });

    test('Viết: cả đề ngẫu nhiên lẫn đề theo dạng; không chèn cho tiếng Trung', async () => {
        await generatePrompt({ lang: 'en', nham: ['article'] });
        expect(he()).toMatch(/often makes mistakes with: singular countable nouns/);
        await generatePrompt({ lang: 'en', dang: 'email', nham: ['article'] });
        expect(he()).toMatch(/this kind of text: business email/); // đúng nhánh đề theo dạng
        expect(he()).toMatch(/often makes mistakes with/);
        await generatePrompt({ lang: 'zh', nham: ['article'] });
        expect(he()).not.toMatch(/often makes mistakes/);
    });

    test('Dịch: cài câu cần đúng cấu trúc; không chèn khi dịch sang tiếng Trung', async () => {
        await generatePassage({ lang: 'en', nham: ['preposition'] });
        expect(he()).toMatch(/correct English translation needs this/);
        await generatePassage({ lang: 'zh', nham: ['preposition'] });
        expect(he()).not.toMatch(/often makes mistakes/);
    });
});

describe('controller', () => {
    const doc = (f) => readFileSync(join(__dirname, '..', 'controllers', f), 'utf8');

    test('cả ba chế độ: tắt được bằng nhamYeu:false, trả nhamLoi cho client', () => {
        for (const f of ['conversationController.js', 'essayController.js', 'translationController.js']) {
            const src = doc(f);
            expect(src).toMatch(/req\.body\.nhamYeu === false \? \[\] : await layNham\(req\.user\.id, lang\)/);
            expect(src).toMatch(/nhamLoi: nham,/);
        }
    });

    test('Hội thoại: chốt nhóm lỗi vào phiên, các lượt đáp đọc lại từ phiên', () => {
        const src = doc('conversationController.js');
        expect(src).toMatch(/nhamLoi: nhamKeys,/);
        expect(src).toMatch(/nham: convo\.nhamLoi \|\| \[\],/);
    });
});
