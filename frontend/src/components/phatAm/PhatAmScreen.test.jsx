/**
 * Tra cứu phát âm (màn hình). Chỗ dễ hỏng: kết quả thiếu phần nối âm; gõ chữ Hàn khi đang chọn
 * tiếng Anh mà ô chọn không theo; nút nghe đọc bằng giọng Anh cho câu tiếng Nhật; lỗi server nuốt mất.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ tra: vi.fn(), luot: vi.fn() }));
vi.mock('@api/phatAm.js', () => ({ PhatAmAPI: api }));
vi.mock('@api/vocabulary.js', () => ({ getVocabLang: () => 'en' }));
vi.mock('@game/GameContext.jsx', () => ({ useGame: () => ({ showScreen: vi.fn() }) }));
vi.mock('@components/auth/AuthContext.jsx', () => ({ useAuth: () => ({ isLoggedIn: true }) }));

import PhatAmScreen from './PhatAmScreen.jsx';

const KQ_KO = {
    lang: 'ko', tenNgonNgu: 'Tiếng Hàn', text: '감사합니다', tuCache: false, conLuot: 19,
    ketQua: {
        chuan: 'gamsahamnida [감사함니다]',
        docViet: 'cam-xa-háp-ni-tà',
        docLienMach: 'cam-xa-ham-ni-tà',
        tu: [{ tu: '감사합니다', chuan: 'gamsahamnida', docViet: 'cam-xa-ham-ni-tà', luuY: '' }],
        noiAm: [{ cum: '합니다', hienTuong: 'Biến âm', truoc: 'háp-ni-tà', sau: 'ham-ni-tà', giaiThich: 'ㅂ đứng trước ㄴ đọc thành ㅁ (비음화).' }],
        meo: ['ㄷ ở cuối câu đọc nhẹ như "t".'],
    },
};

let audioSrc = [];
beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    audioSrc = [];
    globalThis.Audio = vi.fn(function Audio(src) { audioSrc.push(src); this.play = () => Promise.resolve(); this.pause = () => {}; });
    api.luot.mockResolvedValue({ conLuot: 20 });
    api.tra.mockResolvedValue(KQ_KO);
});

describe('tra cứu phát âm', () => {
    test('có đủ ngôn ngữ trong sổ, kể cả Nhật và Hàn', async () => {
        render(<PhatAmScreen active />);
        for (const ten of [/Tiếng Anh/, /Tiếng Trung/, /Tiếng Nhật/, /Tiếng Hàn/]) {
            expect(screen.getByRole('button', { name: ten })).toBeTruthy();
        }
        expect(await screen.findByText(/Còn 20 lượt/)).toBeTruthy();
    });

    test('kết quả: phiên âm chuẩn, đọc kiểu Việt, khi nói liền, nối âm, mẹo; ô chọn theo ngôn ngữ của chữ', async () => {
        render(<PhatAmScreen active />);
        fireEvent.change(screen.getByRole('textbox', { name: /cần tra phát âm/ }), { target: { value: '감사합니다' } });
        expect(screen.getByText(/sẽ tra theo ngôn ngữ đó/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Tra' }));
        await screen.findByText('gamsahamnida [감사함니다]');
        expect(api.tra).toHaveBeenCalledWith('감사합니다', 'en');
        expect(screen.getByText('cam-xa-háp-ni-tà')).toBeTruthy();
        expect(screen.getAllByText('cam-xa-ham-ni-tà').length).toBeGreaterThan(0);
        expect(screen.getByText('Biến âm')).toBeTruthy();
        expect(screen.getByText(/비음화/)).toBeTruthy();
        expect(screen.getByText(/Mẹo cho người Việt/)).toBeTruthy();
        await waitFor(() => expect(screen.getByRole('button', { name: /Tiếng Hàn/ }).getAttribute('aria-pressed')).toBe('true'));
    });

    test('nút nghe dùng giọng của ngôn ngữ (ko-kr), có nghe chậm', async () => {
        render(<PhatAmScreen active />);
        fireEvent.change(screen.getByRole('textbox', { name: /cần tra phát âm/ }), { target: { value: '감사합니다' } });
        fireEvent.click(screen.getByRole('button', { name: 'Tra' }));
        await screen.findByText('gamsahamnida [감사함니다]');
        fireEvent.click(screen.getByRole('button', { name: 'Nghe: 감사합니다' }));
        fireEvent.click(screen.getByRole('button', { name: 'Nghe chậm: 감사합니다' }));
        expect(audioSrc[0]).toMatch(/lang=ko-kr&rate=1$/);
        expect(audioSrc[1]).toMatch(/rate=0\.6$/);
    });

    test('lỗi server (hết lượt) hiện cho người học', async () => {
        api.tra.mockRejectedValue(new Error('Hôm nay bạn đã dùng hết 20 lượt tra phát âm bằng AI.'));
        render(<PhatAmScreen active />);
        fireEvent.change(screen.getByRole('textbox', { name: /cần tra phát âm/ }), { target: { value: 'hello' } });
        fireEvent.click(screen.getByRole('button', { name: 'Tra' }));
        expect((await screen.findByRole('alert')).textContent).toMatch(/hết 20 lượt/);
    });
});
