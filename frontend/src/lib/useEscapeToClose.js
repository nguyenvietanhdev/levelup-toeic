import { useEffect } from 'react';

/**
 * Esc đóng modal.
 *
 * Gắn ở `document` chứ không ở khung modal: focus thường nằm trong một <input>
 * bên trong (ô dịch, ô tìm kiếm, form thêm từ), mà sự kiện bàn phím ở đó không
 * tới được khung ngoài nếu chỉ gắn onKeyDown trên khung.
 *
 * Có 5 modal render riêng, không đi qua ui/Modal.jsx nên không hưởng chỗ xử lý
 * Esc chung ở đó. Gom vào một hook thay vì chép 5 lần — chép tay là kiểu gì
 * cũng có chỗ thứ 6 bị quên.
 *
 * @param {() => void} onClose  hàm đóng modal
 * @param {boolean}    enabled  false thì không gắn (modal bắt buộc chọn)
 */
export function useEscapeToClose(onClose, enabled = true) {
    useEffect(() => {
        if (!enabled || typeof onClose !== 'function') return;
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose, enabled]);
}
