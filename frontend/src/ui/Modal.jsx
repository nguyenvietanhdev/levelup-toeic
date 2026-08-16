import { useState, useEffect, useCallback } from 'react';
import { EventBus, GameEvents } from '@game/eventBus.js';

let _showModal = null;
let _closeModal = null;

export const Modal = {
    show(options) { _showModal?.(options); },
    close() { _closeModal?.(); },
};

export default function ModalContainer() {
    const [modal, setModal] = useState(null);

    // Mở modal mới đè modal đang mở → PHẢI gọi onClose của modal cũ, nếu không
    // cleanup (unsubscribe EventBus…) của nó bị bỏ qua → leak listener, popup "đơ".
    const show = useCallback((options) => setModal(prev => {
        if (prev?.onClose) prev.onClose();
        return options;
    }), []);
    const close = useCallback(() => {
        setModal(prev => {
            if (prev?.onClose) prev.onClose();
            return null;
        });
        EventBus.emit(GameEvents.MODAL_CLOSED);
    }, []);

    useEffect(() => {
        _showModal = show;
        _closeModal = close;
        window.Modal = Modal;
        window._reactModal = Modal;
        return () => { _showModal = null; _closeModal = null; };
    }, [show, close]);

    // Esc đóng modal đang mở.
    //
    // Gắn ở document chứ không ở khung modal: focus thường nằm trong một <input>
    // bên trong (ô Dịch nhanh, form thêm từ), mà sự kiện bàn phím ở đó không tới
    // được khung ngoài nếu chỉ gắn onKeyDown trên đó.
    //
    // Modal nào KHÔNG cho đóng bằng Esc thì khai `dismissible: false` — dùng cho
    // hộp thoại bắt buộc chọn, để một phím lỡ tay không bỏ qua mất quyết định.
    useEffect(() => {
        if (!modal || modal.dismissible === false) return;
        const onKey = (e) => { if (e.key === 'Escape') close(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [modal, close]);

    if (!modal) return <div id="modal-container" />;


    const handleButtonClick = (btn) => {
        btn.onClick?.();
        if (btn.closeOnClick !== false) close();
    };

    return (
        <div
            id="modal-container"
            className={`active${modal.aboveOverlay ? ' modal-container--above-overlay' : ''}`}
        >
            <div className="modal-backdrop" onClick={modal.closeOnBackdrop !== false ? close : undefined}></div>
            <div className={`modal${modal.wide ? ' modal--wide' : ''}`}>
                <div className="modal-header">
                    <h3>{modal.title || 'Thông báo'}</h3>
                    {modal.headerActionHtml && (
                        <span
                            className="modal-header-action"
                            style={{ marginLeft: 'auto', marginRight: '8px' }}
                            dangerouslySetInnerHTML={{ __html: modal.headerActionHtml }}
                        />
                    )}
                    <button className="icon-btn modal-close-btn" onClick={close}>
                        <i className="fas fa-times"></i>
                    </button>
                </div>
                <div className="modal-body">
                    {modal.contentJsx || (modal.content && (
                        <div dangerouslySetInnerHTML={{ __html: modal.content }} />
                    ))}
                </div>
                {modal.buttons && modal.buttons.length > 0 && (
                    <div className="modal-footer">
                        {modal.buttons.map((btn, i) => (
                            <button
                                key={i}
                                className={`btn ${btn.className || 'btn-primary'}`}
                                onClick={() => handleButtonClick(btn)}
                            >
                                {btn.text}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
