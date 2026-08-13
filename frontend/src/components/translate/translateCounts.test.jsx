/**
 * Số lượng trên hai nút "Xem ..." của Dịch nhanh.
 *
 * Điểm dễ sai: khi CHƯA biết số (API chưa trả về, hoặc lỗi mạng) thì phải không
 * hiện gì, KHÔNG hiện "0". Số 0 là một khẳng định — người dùng có 114 từ mà
 * thấy "0" sẽ tưởng dữ liệu đã mất. "Chưa tải xong" và "không có từ nào" là hai
 * trạng thái khác nhau và phải trông khác nhau.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const topicsMock = vi.fn();
vi.mock('@api/uploadVocab.js', () => ({
    UploadVocabAPI: { myTopics: (...a) => topicsMock(...a), create: vi.fn() },
}));
vi.mock('@api/favorites.js', () => ({ FavoritesAPI: { add: vi.fn(), list: vi.fn() } }));
vi.mock('@game/state.js', () => ({
    GameState: { state: { progress: { favoriteWords: [{ en: 'a' }, { en: 'b' }, { en: 'c' }] } } },
}));
vi.mock('@components/vocab/upload/openUploadModal.js', () => ({ openUploadModal: vi.fn() }));

import TranslateModal from './TranslateModal.jsx';

beforeEach(() => {
    topicsMock.mockReset();
    // Chặn gọi mạng thật của phần dịch — test này chỉ nói về con số trên nút.
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
});

function open() {
    return render(<TranslateModal text="hello" onClose={() => {}} />);
}

describe('số từ trên nút', () => {
    test('KHÔNG còn nút "Xem từ yêu thích" trong popup', () => {
        // Popup này giờ chỉ làm một việc: dịch rồi lưu vào từ vựng riêng.
        // Yêu thích vẫn mở được từ thanh nav.
        topicsMock.mockResolvedValue({ success: true, data: [] });
        open();
        expect(screen.queryByText(/Xem từ yêu thích/)).toBeNull();
    });

    test('từ vựng riêng = TỔNG wordCount của mọi nguồn', async () => {
        topicsMock.mockResolvedValue({
            success: true,
            data: [{ wordCount: 13 }, { wordCount: 114 }, { wordCount: 5 }],
        });
        open();
        await waitFor(() => {
            const btn = screen.getByText(/Xem từ vựng riêng/).closest('button');
            expect(btn.textContent).toMatch(/132/);      // 13 + 114 + 5
        });
    });

    test('API lỗi thì KHÔNG hiện "0" — 0 là khẳng định sai', async () => {
        topicsMock.mockRejectedValue(new Error('mạng hỏng'));
        open();
        const btn = screen.getByText(/Xem từ vựng riêng/).closest('button');
        await new Promise(r => setTimeout(r, 20));
        expect(btn.textContent).not.toMatch(/\d/);
    });

    test('API trả success:false cũng không hiện số', async () => {
        topicsMock.mockResolvedValue({ success: false });
        open();
        const btn = screen.getByText(/Xem từ vựng riêng/).closest('button');
        await new Promise(r => setTimeout(r, 20));
        expect(btn.textContent).not.toMatch(/\d/);
    });

    test('thật sự có 0 từ thì HIỆN số 0', async () => {
        // Khác hẳn ca trên: ở đây ta BIẾT là rỗng, nên nói ra được.
        topicsMock.mockResolvedValue({ success: true, data: [] });
        open();
        await waitFor(() => {
            const btn = screen.getByText(/Xem từ vựng riêng/).closest('button');
            expect(btn.textContent).toMatch(/0/);
        });
    });
});
