import { createPortal } from 'react-dom';

/**
 * Nút bắt đầu của các màn chọn AI (Hội thoại, Đọc hiểu, Viết, Dịch, Nghe) —
 * NỔI CỐ ĐỊNH giữa đáy khung nhìn, cuộn tới đâu cũng thấy và bấm được.
 *
 * Vẽ thẳng vào `<body>` (portal) thay vì nằm trong khung giới thiệu: `position:
 * fixed` chỉ bám khung nhìn khi KHÔNG lớp cha nào có transform/filter/contain —
 * đặt trong cây màn hình là phụ thuộc vào mọi thay đổi bố cục sau này. Portal
 * thì không lớp cha nào chen vào được.
 *
 * Chỉ vẽ khi màn đang mở (`active`): các màn ẩn vẫn được giữ trong DOM, portal
 * của chúng mà vẫn vẽ là nút của màn khác nổi đè lên màn đang xem.
 */
export default function NutBatDau({ active, onClick, disabled, children }) {
    if (!active || typeof document === 'undefined') return null;
    return createPortal(
        <button className="btn btn-primary ai-start-float" onClick={onClick} disabled={disabled}>
            {children}
        </button>,
        document.body,
    );
}
