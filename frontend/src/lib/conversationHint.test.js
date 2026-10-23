import { describe, test, expect } from 'vitest';
import { goiYCauTraLoi, cauHoiCuoi } from './conversationHint.js';

describe('nhận dạng dạng câu hỏi', () => {
    test('Yes/No: bắt đầu bằng trợ động từ', () => {
        expect(goiYCauTraLoi('Do you keep a record of your daily spending?').loai).toBe('Có / Không');
        expect(goiYCauTraLoi('Have you ever been to London?').loai).toBe('Có / Không');
    });

    test('tần suất: how often đứng trước how', () => {
        expect(goiYCauTraLoi('How often do you check your budget?').loai).toBe('Tần suất');
    });

    test('wh-: what / where / why / how / who', () => {
        expect(goiYCauTraLoi('What do you do on weekends?').loai).toBe('Sự việc');
        expect(goiYCauTraLoi('Where do you usually eat lunch?').loai).toBe('Địa điểm');
        expect(goiYCauTraLoi('Why did you choose this job?').loai).toBe('Lý do');
        expect(goiYCauTraLoi('How do you get to work?').loai).toBe('Cách làm');
    });

    test('câu không nhận ra được → khung mở chung, không lỗi', () => {
        const r = goiYCauTraLoi('Tell me something about yourself.');
        expect(r.loai).toBe('Mở');
        expect(r.khung).toMatch(/because/);
    });

    test('câu rỗng hoặc undefined không làm vỡ', () => {
        expect(() => goiYCauTraLoi(undefined)).not.toThrow();
        expect(goiYCauTraLoi('').loai).toBe('Mở');
    });
});

describe('từ gợi ý', () => {
    test('chỉ gợi ý từ CHƯA dùng', () => {
        const r = goiYCauTraLoi('Do you use a budget?', ['ledger', 'budget', 'audit'], ['budget']);
        expect(r.tuGoiY).toEqual(['ledger', 'audit']);
    });

    test('tối đa 4 từ, để chip không chiếm hết khung', () => {
        const muc = ['a', 'b', 'c', 'd', 'e', 'f'];
        expect(goiYCauTraLoi('Why?', muc, []).tuGoiY).toHaveLength(4);
    });

    test('dùng hết từ thì danh sách rỗng, không gợi ý từ đã dùng', () => {
        const r = goiYCauTraLoi('Why?', ['x', 'y'], ['x', 'y']);
        expect(r.tuGoiY).toEqual([]);
    });

    test('không truyền danh sách từ vẫn chạy', () => {
        expect(goiYCauTraLoi('Why?').tuGoiY).toEqual([]);
    });
});

describe('bám câu hỏi CUỐI của lời AI, không phải đầu câu', () => {
    test('lời mở bằng câu chào vẫn nhận ra câu hỏi phía sau', () => {
        const r = goiYCauTraLoi('Good morning, welcome to our hotel. Who are you, please?');
        expect(r.cauHoi).toBe('Who are you, please?');
        expect(r.loai).toBe('Giới thiệu');
        expect(r.cacKhung[0]).toMatch(/My name is ___/);
    });

    test('nhiều câu hỏi thì lấy câu cuối', () => {
        expect(cauHoiCuoi('Is this your first visit? How long will you stay?')).toBe('How long will you stay?');
        expect(cauHoiCuoi('Nice to meet you.')).toBe('Nice to meet you.');
        expect(cauHoiCuoi('')).toBe('');
    });

    test('nhận thêm dạng: hỏi thăm, mời, nhờ, lựa chọn, ý kiến, giá, thời gian', () => {
        expect(goiYCauTraLoi('How are you today?').loai).toBe('Hỏi thăm');
        expect(goiYCauTraLoi('Would you like a drink?').loai).toBe('Mời / đề nghị');
        expect(goiYCauTraLoi('Could you spell your name?').loai).toBe('Nhờ / yêu cầu');
        expect(goiYCauTraLoi('Tea or coffee?').loai).toBe('Lựa chọn');
        expect(goiYCauTraLoi('What do you think about remote work?').loai).toBe('Ý kiến');
        expect(goiYCauTraLoi('How much does it cost?').loai).toBe('Số lượng / giá');
        expect(goiYCauTraLoi('When do you check out?').loai).toBe('Thời gian');
        expect(goiYCauTraLoi('What do you do?').loai).toBe('Nghề nghiệp');
    });

    test('mỗi dạng có 2 khung trở lên, đều có chỗ trống ___ để tự điền', () => {
        for (const q of ['Who are you?', 'Why?', 'Do you like it?', 'Tell me about it.']) {
            const r = goiYCauTraLoi(q);
            expect(r.cacKhung.length).toBeGreaterThanOrEqual(2);
            for (const k of r.cacKhung) expect(k).toContain('___');
        }
    });
});

describe('ưu tiên khung AI viết kèm', () => {
    test('có khung AI thì dùng khung AI, đánh dấu tuAI', () => {
        const r = goiYCauTraLoi('Welcome! Who are you?', [], [], ['I have a booking under ___.', 'My name is ___.']);
        expect(r.tuAI).toBe(true);
        expect(r.cacKhung).toEqual(['I have a booking under ___.', 'My name is ___.']);
        expect(r.khung).toBe('I have a booking under ___.');
    });

    test('khung AI rỗng hoặc rác thì rơi về luật', () => {
        expect(goiYCauTraLoi('Why?', [], [], []).tuAI).toBe(false);
        expect(goiYCauTraLoi('Why?', [], [], ['', '  ', null]).loai).toBe('Lý do');
    });
});
