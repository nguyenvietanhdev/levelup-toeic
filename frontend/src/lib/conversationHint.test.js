import { describe, test, expect } from 'vitest';
import { goiYCauTraLoi } from './conversationHint.js';

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
