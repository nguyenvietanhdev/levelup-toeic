/**
 * Thanh điều hướng của "Từ vựng yêu thích": tìm, lọc ngôn ngữ, đếm.
 *
 * Danh sách yêu thích cũng TRỘN Anh–Trung như bộ từ vựng riêng. Hai hệ quả:
 *   - nút phát âm phải chọn giọng theo từng từ, không cứng 'en-US';
 *   - cần lọc theo ngôn ngữ, nhưng chỉ khi danh sách thực sự có cả hai — hiện
 *     một nút lọc không dùng tới cho người chỉ học tiếng Anh là rác.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FavoritesModal from './FavoritesModal.jsx';

const mockState = { words: [], loading: false };
vi.mock('./useFavorites.js', () => ({
    useFavorites: () => ({
        words: mockState.words,
        loading: mockState.loading,
        remove: vi.fn(), removeAll: vi.fn(), reload: vi.fn(),
    }),
}));
vi.mock('@components/auth/AuthContext.jsx', () => ({
    useAuth: () => ({ isLoggedIn: true }),
}));

const EN = [
    { en: 'caterer', vn: 'người cung cấp đồ ăn', phonetic: 'ˈkeɪtərər' },
    { en: 'pay-paid-paid', vn: 'trả tiền, thanh toán' },
];
const ZH = [{ en: '你好', vn: 'xin chào', lang: 'zh' }];

function open(words) {
    mockState.words = words;
    return render(<FavoritesModal open onClose={() => {}} />);
}

beforeEach(() => { mockState.words = []; mockState.loading = false; });

describe('bộ lọc ngôn ngữ', () => {
    test('KHÔNG hiện khi danh sách chỉ có tiếng Anh', () => {
        open(EN);
        expect(screen.queryByText('中')).toBeNull();
    });

    test('hiện khi danh sách trộn Anh–Trung', () => {
        open([...EN, ...ZH]);
        expect(screen.getByText('中')).toBeTruthy();
    });

    test('lọc 中 chỉ còn từ tiếng Trung', () => {
        open([...EN, ...ZH]);
        fireEvent.click(screen.getByText('中'));
        expect(screen.getByText('你好')).toBeTruthy();
        expect(screen.queryByText('caterer')).toBeNull();
    });

    test('từ CŨ chưa có trường lang vẫn nhận ra qua mặt chữ', () => {
        // Bản ghi cũ trong DB không có `lang` — không đoán được thì chúng lọt vào
        // nhóm EN và đọc bằng giọng Anh.
        open([...EN, { en: '这是谁', vn: 'đây là ai' }]);
        fireEvent.click(screen.getByText('中'));
        expect(screen.getByText('这是谁')).toBeTruthy();
        expect(screen.queryByText('caterer')).toBeNull();
    });
});

describe('ô tìm kiếm', () => {
    test('tìm theo mặt chữ', () => {
        open(EN);
        fireEvent.change(screen.getByPlaceholderText(/Tìm trong danh sách/), { target: { value: 'cater' } });
        expect(screen.getByText('caterer')).toBeTruthy();
        expect(screen.queryByText('pay-paid-paid')).toBeNull();
    });

    test('tìm được cả theo NGHĨA tiếng Việt', () => {
        // Nhớ nghĩa mà quên mặt chữ là trường hợp thường gặp nhất khi lục lại.
        open(EN);
        fireEvent.change(screen.getByPlaceholderText(/Tìm trong danh sách/), { target: { value: 'thanh toán' } });
        expect(screen.getByText('pay-paid-paid')).toBeTruthy();
        expect(screen.queryByText('caterer')).toBeNull();
    });

    test('đếm hiện dạng "đang hiện/tổng" khi đang lọc', () => {
        open(EN);
        expect(screen.getByText('2 từ')).toBeTruthy();
        fireEvent.change(screen.getByPlaceholderText(/Tìm trong danh sách/), { target: { value: 'cater' } });
        expect(screen.getByText('1/2 từ')).toBeTruthy();
    });

    test('lọc ra 0 kết quả nói RÕ là do bộ lọc, không phải danh sách trống', () => {
        open(EN);
        fireEvent.change(screen.getByPlaceholderText(/Tìm trong danh sách/), { target: { value: 'zzzz' } });
        expect(screen.getByText(/khớp bộ lọc/)).toBeTruthy();
        expect(screen.queryByText(/Chưa có từ yêu thích nào/)).toBeNull();
    });

    test('nút "Xoá bộ lọc" đưa danh sách về đủ', () => {
        open(EN);
        fireEvent.change(screen.getByPlaceholderText(/Tìm trong danh sách/), { target: { value: 'zzzz' } });
        fireEvent.click(screen.getByText('Xoá bộ lọc'));
        expect(screen.getByText('caterer')).toBeTruthy();
    });
});

describe('danh sách rỗng thật', () => {
    test('nói "chưa có từ nào", KHÔNG phải lỗi bộ lọc', () => {
        open([]);
        expect(screen.getByText(/Chưa có từ yêu thích nào/)).toBeTruthy();
    });
});
