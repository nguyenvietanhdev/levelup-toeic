import { Component } from 'react';

export default class ErrorBoundary extends Component {
    state = { hasError: false };

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error, info) {
        console.error('[ErrorBoundary] Lỗi runtime không bắt được:', error, info?.componentStack);
    }

    render() {
        if (!this.state.hasError) return this.props.children;

        return (
            <div style={{
                minHeight: '100vh', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', textAlign: 'center',
                padding: 24, gap: 16,
            }}>
                <i className="fas fa-triangle-exclamation fa-3x" style={{ color: 'var(--color-warning, #f59e0b)' }} />
                <h2 style={{ margin: 0 }}>Đã có lỗi xảy ra</h2>
                <p style={{ color: 'var(--text-secondary, #888)', maxWidth: 420 }}>
                    Vui lòng tải lại trang. Nếu lỗi vẫn tiếp diễn, hãy liên hệ hỗ trợ.
                </p>
                <button className="btn-primary" onClick={() => location.reload()}>
                    Tải lại trang
                </button>
            </div>
        );
    }
}
