/**
 * Lịch sử Nghe: xem lại một bài thì nghe lại được âm thanh của chính bài đó.
 *
 * Chỗ dễ hỏng: trình phát trỏ nhầm bài, tự tải âm thanh của mọi bài ngay khi mở (tốn băng thông),
 * hoặc nút tốc độ không đổi tốc độ phát.
 */
import { test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const api = vi.hoisted(() => ({
    history: vi.fn(async () => [{ _id: 'p42', dangVi: 'Sân bay', level: 'medium', targetWords: ['gate'], score: 53 }]),
    detail: vi.fn(async () => ({
        _id: 'p42', dangVi: 'Sân bay', level: 'medium', score: 53, lang: 'en', createdAt: '2026-11-13T12:01:14Z',
        passage: 'Passengers should prepare for gate changes.', typed: 'passenger prepair',
        ketQua: { correct: 24, total: 45, missing: ['gate'], extra: [] },
    })),
    audioUrl: (id, rate) => `/api/listening/${id}/audio?rate=${rate}`,
}));
vi.mock('@api/listening.js', () => ({ ListeningAPI: api }));

import LichSuMode from './LichSuMode.jsx';

test('xem lại bài nghe: có trình phát đúng bài, không tự tải trước, đổi được tốc độ', async () => {
    render(<LichSuMode mode="nghe" />);
    fireEvent.click(await screen.findByText('Sân bay'));
    expect(await screen.findByText('Nghe lại')).toBeTruthy();

    const audio = document.querySelector('.listening-player audio');
    expect(audio.getAttribute('src')).toBe('/api/listening/p42/audio?rate=1');
    expect(audio.getAttribute('preload')).toBe('none');

    fireEvent.click(screen.getByRole('button', { name: '0.75×' }));
    expect(audio.playbackRate).toBe(0.75);
    expect(screen.getByRole('button', { name: '0.75×' }).className).toContain('is-chon');
});
