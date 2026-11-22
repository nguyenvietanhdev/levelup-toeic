/**
 * Popup nhắc từ vựng riêng sắp hết hạn.
 *
 * Chỗ dễ hỏng: bấm vào bộ sắp hết hạn mà không sang trang Từ vựng riêng (hoặc sang mà không mở
 * đúng bộ đó); popup che mất nội dung khi đang ở chính trang đó; tên kỹ thuật (mau-cau-en) hiện
 * thay cho tên dễ đọc.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const api = vi.hoisted(() => ({ expiring: vi.fn(), extendSource: vi.fn(), myVocabulary: vi.fn() }));
const game = vi.hoisted(() => ({ showScreen: vi.fn(), currentScreen: 'home-screen' }));
vi.mock('@api/uploadVocab.js', () => ({ UploadVocabAPI: api }));
vi.mock('@components/auth/AuthContext.jsx', () => ({ useAuth: () => ({ isLoggedIn: true }) }));
vi.mock('@game/GameContext.jsx', () => ({ useGame: () => game }));
vi.mock('@ui/Toaster.jsx', () => ({ Notification: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/vocabExport.js', () => ({ downloadWords: vi.fn(() => 3) }));
vi.mock('./openUploadModal.js', () => ({
    sourceLabel: (s) => ({ 'mau-cau-en': 'Mẫu câu ngữ pháp · Tiếng Anh' }[s] || s),
}));

import ExpiryNotice, { nhanConLai } from './ExpiryNotice.jsx';
import { xemYeuCauTuVungRieng, layYeuCauTuVungRieng } from '@lib/moTuVungRieng.js';

const sau = (ngay) => new Date(Date.now() + ngay * 86400000 - 60000).toISOString();

beforeEach(() => {
    localStorage.clear();
    layYeuCauTuVungRieng();
    game.showScreen.mockClear();
    game.currentScreen = 'home-screen';
    api.expiring.mockReset().mockResolvedValue({
        success: true,
        data: [
            { source: 'mau-cau-en', wordCount: 4, expiresAt: sau(1) },
            { source: 'tu-hoc-it', wordCount: 20, expiresAt: sau(3) },
        ],
    });
});

describe('popup sắp hết hạn', () => {
    test('nhãn thời hạn', () => {
        expect(nhanConLai(0)).toBe('Hết hạn hôm nay');
        expect(nhanConLai(1)).toBe('Còn 1 ngày');
        expect(nhanConLai(3)).toBe('Còn 3 ngày');
    });

    test('liệt kê từng bộ với tên dễ đọc, tổng số từ, hạn gần nhất; bộ còn ≤ 1 ngày được tô đỏ', async () => {
        render(<ExpiryNotice />);
        expect(await screen.findByText('Mẫu câu ngữ pháp · Tiếng Anh')).toBeTruthy();
        expect(screen.getByText('2 bộ · 24 từ · còn 1 ngày')).toBeTruthy();
        expect(screen.getByText('Mẫu câu ngữ pháp · Tiếng Anh').closest('li').className).toContain('is-gap');
        expect(screen.getByText('tu-hoc-it').closest('li').className).not.toContain('is-gap');
    });

    test('bấm vào một bộ: sang trang Từ vựng riêng và yêu cầu mở sẵn đúng bộ đó', async () => {
        render(<ExpiryNotice />);
        fireEvent.click(await screen.findByRole('button', { name: /Mẫu câu ngữ pháp · Tiếng Anh/ }));
        expect(game.showScreen).toHaveBeenCalledWith('vocab-screen');
        expect(xemYeuCauTuVungRieng()).toMatchObject({ nguon: 'mau-cau-en' });
    });

    test('nút "Mở Từ vựng riêng": sang trang, không chọn bộ nào', async () => {
        render(<ExpiryNotice />);
        fireEvent.click(await screen.findByRole('button', { name: /Mở Từ vựng riêng/ }));
        expect(game.showScreen).toHaveBeenCalledWith('vocab-screen');
        expect(xemYeuCauTuVungRieng()).toMatchObject({ nguon: '' });
    });

    test('đang ở chính trang Từ vựng riêng thì không hiện (khỏi che nội dung)', async () => {
        game.currentScreen = 'vocab-screen';
        render(<ExpiryNotice />);
        await Promise.resolve();
        await new Promise((r) => setTimeout(r, 0));
        expect(screen.queryByRole('region', { name: 'Từ vựng riêng sắp hết hạn' })).toBeNull();
    });

    test('đóng thì không nhắc lại các bộ đó', async () => {
        const { unmount } = render(<ExpiryNotice />);
        fireEvent.click(await screen.findByRole('button', { name: 'Đóng' }));
        expect(screen.queryByRole('region', { name: 'Từ vựng riêng sắp hết hạn' })).toBeNull();
        unmount();
        render(<ExpiryNotice />);
        await new Promise((r) => setTimeout(r, 0));
        expect(screen.queryByRole('region', { name: 'Từ vựng riêng sắp hết hạn' })).toBeNull();
    });
});
