/**
 * Tab "Từ vựng riêng" gộp kho của mình và kho được chia sẻ.
 *
 * Bẫy dễ dính nhất: bộ được chia sẻ có thể TRÙNG TÊN với bộ của chính mình.
 * Danh sách trước đây key theo `t.source` và so `current?.source === t.source`,
 * nên hai thẻ cùng tên sẽ đụng key React và chọn cái này thì cái kia sáng lên.
 * Phải dùng khoá phức hợp (chủ + tên bộ).
 *
 * Thứ hai: grant còn nhưng TTL đã xoá hết từ → BIA MỘ. Thẻ vẫn phải hiện, ghi rõ
 * "Đã hết hạn", không bấm vào được. Lọc bỏ nó là bộ từ biến mất im lặng — đúng
 * thứ cả tính năng này cố tránh.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const state = { personal: [], current: null };
const selectPersonal = vi.fn();
const selectSharedWithMe = vi.fn();
const copyShared = vi.fn(() => Promise.resolve({ success: true, message: 'ok' }));

vi.mock('./useTopics.js', () => ({
    useTopics: () => ({
        shared: [], wrong: [], personal: state.personal, current: state.current,
        loadingShared: false, loadingPersonal: false, loadingWrong: false,
        loadShared: vi.fn(), loadPersonal: vi.fn(), loadWrong: vi.fn(),
        // `TopicModal` gọi hàm này khi mở popup để đếm từ sai. Thiếu trong
        // mock là component ném ngay, và lỗi trông như hỏng phần chia sẻ.
        loadTuSai: vi.fn(), tuSai: {},
        selectShared: vi.fn(), selectPersonal, selectWrong: vi.fn(),
        selectSharedWithMe, copyShared,
    }),
}));
vi.mock('@ui/Toaster.jsx', () => ({
    Notification: { success: vi.fn(), error: vi.fn(), show: vi.fn() },
}));

import TopicModal from './TopicModal.jsx';

/** Mở modal ở tab "Từ vựng riêng". */
function openPersonalTab(personal, current = null) {
    state.personal = personal;
    state.current = current;
    render(<TopicModal open onClose={() => {}} onSelected={() => {}} />);
    fireEvent.click(screen.getByText(/Từ vựng riêng/));
}

const MINE = { source: 'verb_pattern', wordCount: 114, isShared: false };
const THEIRS = { source: 'verb_pattern', wordCount: 114, isShared: true, ownerEmail: 'a@b.com', ownerName: 'Chien than toc do', expired: false };
const DEAD = { source: 'bo-het-han', wordCount: 0, isShared: true, ownerEmail: 'a@b.com', expired: true };

beforeEach(() => {
    selectPersonal.mockClear();
    selectSharedWithMe.mockClear();
    copyShared.mockClear();
});

describe('trùng tên giữa bộ của mình và bộ được chia sẻ', () => {
    test('hiện thành HAI thẻ riêng biệt', () => {
        openPersonalTab([MINE, THEIRS]);
        expect(screen.getAllByText('verb_pattern')).toHaveLength(2);
    });

    test('chỉ thẻ ĐANG CHỌN sáng, không sáng nhầm thẻ cùng tên', () => {
        // Đang chọn bộ ĐƯỢC CHIA SẺ → thẻ của mình không được có badge.
        openPersonalTab([MINE, THEIRS], { source: 'verb_pattern', isShared: true, ownerEmail: 'a@b.com' });
        expect(screen.getAllByText(/Đang chọn/)).toHaveLength(1);
    });

    test('bấm thẻ được chia sẻ gọi ĐÚNG hàm, kèm email chủ', () => {
        openPersonalTab([THEIRS]);
        fireEvent.click(screen.getByText('verb_pattern').closest('.topic-card'));
        expect(selectSharedWithMe).toHaveBeenCalledWith('a@b.com', 'verb_pattern');
        expect(selectPersonal).not.toHaveBeenCalled();
    });

    test('bấm thẻ của mình vẫn gọi hàm cũ', () => {
        openPersonalTab([MINE]);
        fireEvent.click(screen.getByText('verb_pattern').closest('.topic-card'));
        expect(selectPersonal).toHaveBeenCalledWith('verb_pattern');
        expect(selectSharedWithMe).not.toHaveBeenCalled();
    });
});

describe('bia mộ — bộ được chia sẻ đã hết hạn', () => {
    test('VẪN hiện, không bị lọc bỏ', () => {
        openPersonalTab([DEAD]);
        expect(screen.getByText('bo-het-han')).toBeTruthy();
    });

    test('ghi rõ "Đã hết hạn" thay vì "0 từ"', () => {
        openPersonalTab([DEAD]);
        expect(screen.getByText(/Đã hết hạn/)).toBeTruthy();
    });

    test('bấm vào KHÔNG mở — không còn từ nào để luyện', () => {
        openPersonalTab([DEAD]);
        fireEvent.click(screen.getByText('bo-het-han').closest('.topic-card'));
        expect(selectSharedWithMe).not.toHaveBeenCalled();
    });

    test('không có nút sao chép — không còn gì để chép', () => {
        openPersonalTab([DEAD]);
        expect(document.querySelector('.topic-copy-btn')).toBeNull();
    });
});

describe('nhãn (shared)', () => {
    test('bộ được chia sẻ ghi rõ "(shared)" trên tên', () => {
        // Bộ đó có thể TRÙNG TÊN với bộ của mình — hai thẻ cạnh nhau cùng chữ
        // `dich-nhanh-zh` thì không biết cái nào của ai. Badge 🤝 ở icon dễ bỏ
        // qua khi lướt nhanh.
        openPersonalTab([THEIRS]);
        expect(screen.getByText(/\(shared\)/)).toBeTruthy();
    });

    test('bộ của MÌNH không có nhãn đó', () => {
        openPersonalTab([MINE]);
        expect(screen.queryByText(/\(shared\)/)).toBeNull();
    });
});

describe('sao chép về kho riêng', () => {
    test('nút chỉ hiện trên bộ ĐƯỢC CHIA SẺ', () => {
        openPersonalTab([MINE]);
        expect(document.querySelector('.topic-copy-btn')).toBeNull();
    });

    test('bấm nút sao chép KHÔNG kéo theo việc chọn bộ đó', () => {
        // Thiếu stopPropagation thì một cú bấm vừa chép vừa đổi đề đang học.
        openPersonalTab([THEIRS]);
        fireEvent.click(document.querySelector('.topic-copy-btn'));
        expect(copyShared).toHaveBeenCalledWith('a@b.com', 'verb_pattern');
        expect(selectSharedWithMe).not.toHaveBeenCalled();
    });

    test('hiện TÊN chủ sở hữu, KHÔNG hiện email', () => {
        // Đối xứng với việc chủ cũng không thấy email người nhận.
        openPersonalTab([THEIRS]);
        expect(screen.getByText(/Chien than toc do/)).toBeTruthy();
        expect(screen.queryByText(/a@b\.com/)).toBeNull();
    });
});
