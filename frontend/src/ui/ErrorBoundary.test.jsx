import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary.jsx';

function Bomb() {
    throw new Error('boom');
}

describe('ErrorBoundary', () => {
    it('render children bình thường khi không có lỗi', () => {
        render(
            <ErrorBoundary>
                <div>Nội dung an toàn</div>
            </ErrorBoundary>
        );
        expect(screen.getByText('Nội dung an toàn')).toBeInTheDocument();
    });

    it('hiện fallback UI thay vì crash khi con throw lỗi', () => {
        // React log lỗi ra console.error trong test — tắt tạm để output sạch.
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

        render(
            <ErrorBoundary>
                <Bomb />
            </ErrorBoundary>
        );

        expect(screen.getByText('Đã có lỗi xảy ra')).toBeInTheDocument();
        expect(screen.getByText('Tải lại trang')).toBeInTheDocument();

        spy.mockRestore();
    });
});
