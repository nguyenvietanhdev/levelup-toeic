import { useEffect } from 'react';

/**
 * Xem ảnh cỡ lớn ngay trong app.
 *
 * Trước đây bấm ảnh là window.open() sang tab mới — muốn quay lại phải đóng
 * tab, mà đang giữa bài thi thì rất phiền. Giờ mở đè lên: bấm ra ngoài, bấm
 * nút ×, hoặc Esc là đóng — ba lối thoát ai cũng thử.
 */
export default function ImageLightbox({ src, alt = '', onClose }) {
    useEffect(() => {
        if (!src) return;
        const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
        window.addEventListener('keydown', onKey);
        // Khoá cuộn nền để lăn chuột phóng to ảnh chứ không kéo trang phía dưới.
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = prev;
        };
    }, [src, onClose]);

    if (!src) return null;

    return (
        <div
            className="toeic-lightbox"
            role="dialog"
            aria-modal="true"
            onClick={onClose}                 // bấm nền → đóng
        >
            <button className="toeic-lightbox-close" title="Đóng (Esc)" onClick={onClose}>
                <i className="fas fa-xmark"></i>
            </button>
            <img
                src={src}
                alt={alt}
                className="toeic-lightbox-img"
                onClick={e => e.stopPropagation()}  // bấm trúng ảnh thì KHÔNG đóng
            />
        </div>
    );
}
