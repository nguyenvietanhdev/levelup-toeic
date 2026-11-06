/**
 * Danh sách yêu thích hỏng không được làm sập app: hook này chạy ngay khi vẽ thanh trên cùng,
 * nên giá trị không phải mảng trong localStorage từng làm trắng màn hình ở MỌI lần mở app.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockGame = vi.hoisted(() => ({ state: { progress: {} }, save: vi.fn() }));
const mockList = vi.hoisted(() => vi.fn());
vi.mock('@game/state.js', () => ({ GameState: mockGame }));
vi.mock('@api/favorites.js', () => ({ FavoritesAPI: { list: mockList } }));

import { useFavorites } from './useFavorites.js';

beforeEach(() => {
    mockGame.state = { progress: {} };
    mockGame.save.mockClear();
    mockList.mockReset();
});

describe('dữ liệu hỏng', () => {
    test.each([
        ['object rỗng', {}],
        ['chuỗi', 'abc'],
        ['số', 5],
    ])('bản sao cục bộ là %s: coi như danh sách rỗng, không sập', (_, hong) => {
        mockGame.state.progress.favoriteWords = hong;
        const { result } = renderHook(() => useFavorites(false));
        expect(result.current.words).toEqual([]);
        expect(result.current.isFavorite('x')).toBe(false);
    });

    test('server trả sai dạng: giữ danh sách đang có, không ghi đè bản sao', async () => {
        mockGame.state.progress.favoriteWords = [{ en: 'a' }];
        mockList.mockResolvedValue({ success: true, data: {} });
        const { result } = renderHook(() => useFavorites(true));
        await waitFor(() => expect(result.current.loading).toBe(false));
        await waitFor(() => expect(mockList).toHaveBeenCalled());
        expect(result.current.words).toEqual([{ en: 'a' }]);
        expect(mockGame.save).not.toHaveBeenCalled();
    });
});

describe('dữ liệu đúng vẫn chạy như cũ', () => {
    test('đọc được bản sao cục bộ khi chưa đăng nhập', () => {
        mockGame.state.progress.favoriteWords = [{ en: 'a' }];
        const { result } = renderHook(() => useFavorites(false));
        expect(result.current.isFavorite('a')).toBe(true);
    });

    test('server trả mảng: cập nhật và lưu bản sao', async () => {
        mockList.mockResolvedValue({ success: true, data: [{ en: 'b' }] });
        const { result } = renderHook(() => useFavorites(true));
        await waitFor(() => expect(result.current.words).toEqual([{ en: 'b' }]));
        expect(mockGame.state.progress.favoriteWords).toEqual([{ en: 'b' }]);
    });

    test('server trả rỗng (null): về danh sách rỗng', async () => {
        mockGame.state.progress.favoriteWords = [{ en: 'a' }];
        mockList.mockResolvedValue({ success: true, data: null });
        const { result } = renderHook(() => useFavorites(true));
        await waitFor(() => expect(result.current.words).toEqual([]));
    });
});
