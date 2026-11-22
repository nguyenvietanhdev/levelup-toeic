/**
 * Luyện lại bài dịch từ Lịch sử: cùng chiều (đoạn gốc) hoặc đổi chiều (bản tham khảo làm đề).
 *
 * Chỗ dễ hỏng: đổi chiều mà vẫn dùng đoạn gốc (bắt dịch tiếng Việt sang tiếng Việt); quên đổi
 * `chieu` nên chấm nhầm tiêu chí; bài cũ không có bản tham khảo mà vẫn cho đổi chiều; bài tiếng
 * Trung luyện lại khi đang học tiếng Anh (server chấm theo ngôn ngữ đang học → chấm sai).
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { deLuyenLai, nhanChieu } from './luyenLai.js';

const api = vi.hoisted(() => ({ history: vi.fn(), detail: vi.fn(), xemLai: vi.fn() }));
vi.mock('@api/translation.js', () => ({ TranslationAPI: api }));
vi.mock('@api/conversation.js', () => ({ ConversationAPI: {} }));
vi.mock('@api/essay.js', () => ({ EssayAPI: {} }));
vi.mock('@api/reading.js', () => ({ ReadingAPI: {} }));
vi.mock('@api/listening.js', () => ({ ListeningAPI: {} }));
vi.mock('../chuaBai/ChuaBai.jsx', () => ({ default: () => null }));
vi.mock('../chuaBai/XemLaiBai.jsx', () => ({ default: () => null }));
vi.mock('../conversation/ChuaTungCau.jsx', () => ({ default: () => null }));

import LichSuMode from '../history/LichSuMode.jsx';

const BAI = {
    _id: 'a1', chieu: 'vi-ngoai', lang: 'en', level: 'easy', topic: 'Hết sữa', words: ['run out of'],
    passage: 'Sáng nay nhà mình hết sữa.', reference: 'We ran out of milk this morning.',
    translation: 'We run out milk.', overall: 6, scores: {}, notes: [], createdAt: '2026-11-20T08:00:00Z',
};

describe('đề luyện lại', () => {
    test('cùng chiều: dùng lại đoạn gốc', () => {
        expect(deLuyenLai(BAI, false)).toMatchObject({ chieu: 'vi-ngoai', passage: BAI.passage, lang: 'en', level: 'easy', words: ['run out of'], minUnits: 15, luyenLai: 'lai' });
    });
    test('đổi chiều: bản tham khảo thành đề, chiều ngược lại, ngưỡng theo chiều mới', () => {
        expect(deLuyenLai(BAI, true)).toMatchObject({ chieu: 'ngoai-vi', passage: BAI.reference, minUnits: 15, luyenLai: 'doi-chieu' });
        const zh = deLuyenLai({ ...BAI, chieu: 'ngoai-vi', lang: 'zh', passage: '我们没有牛奶了。', reference: 'Nhà mình hết sữa rồi.' }, true);
        expect(zh).toMatchObject({ chieu: 'vi-ngoai', passage: 'Nhà mình hết sữa rồi.', lang: 'zh', minUnits: 20 });
    });
    test('không có nội dung làm đề thì null', () => {
        expect(deLuyenLai({ ...BAI, reference: '' }, true)).toBeNull();
        expect(deLuyenLai(null)).toBeNull();
    });
    test('nhãn chiều', () => {
        expect(nhanChieu('vi-ngoai', 'en')).toBe('Việt → Anh');
        expect(nhanChieu('ngoai-vi', 'zh')).toBe('Trung → Việt');
    });
});

describe('nút trong Lịch sử', () => {
    beforeEach(() => {
        api.history.mockReset().mockResolvedValue([{ _id: 'a1', topic: 'Hết sữa', overall: 6, chieu: 'vi-ngoai', createdAt: BAI.createdAt }]);
        api.detail.mockReset().mockResolvedValue(BAI);
    });

    async function moBai(luyenLai) {
        render(<LichSuMode mode="dich" luyenLai={luyenLai} />);
        fireEvent.click(await screen.findByRole('button', { name: /Hết sữa/ }));
        await screen.findByText(BAI.passage);
    }

    test('luyện lại và đổi chiều gửi đúng đề', async () => {
        const chon = vi.fn();
        await moBai({ lang: 'en', chon });
        fireEvent.click(screen.getByRole('button', { name: /Luyện lại bài này \(Việt → Anh\)/ }));
        expect(chon).toHaveBeenLastCalledWith(expect.objectContaining({ chieu: 'vi-ngoai', passage: BAI.passage }));
        fireEvent.click(screen.getByRole('button', { name: /Đổi chiều: Anh → Việt/ }));
        expect(chon).toHaveBeenLastCalledWith(expect.objectContaining({ chieu: 'ngoai-vi', passage: BAI.reference }));
    });

    test('bài không có bản tham khảo: nút đổi chiều bị khoá', async () => {
        api.detail.mockResolvedValue({ ...BAI, reference: '' });
        await moBai({ lang: 'en', chon: vi.fn() });
        expect(screen.getByRole('button', { name: /Đổi chiều/ })).toBeDisabled();
    });

    test('bài khác ngôn ngữ đang học: không cho luyện lại, nhắc đổi ngôn ngữ', async () => {
        await moBai({ lang: 'zh', chon: vi.fn() });
        expect(screen.queryByRole('button', { name: /Luyện lại bài này/ })).toBeNull();
        expect(screen.getByText(/đổi ngôn ngữ học sang/)).toBeTruthy();
    });

    test('chỗ khác dùng Lịch sử (không truyền luyenLai) thì không có nút', async () => {
        await moBai(null);
        expect(screen.queryByRole('button', { name: /Luyện lại bài này/ })).toBeNull();
    });
});
