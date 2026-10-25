import { useState } from 'react';

/**
 * "Nhắm lỗi hay mắc" — AI ra bài (Hội thoại, Viết, Dịch) tạo cơ hội dùng đúng
 * những cấu trúc người học hay sai, lấy từ hồ sơ "Tiến bộ của tôi" (server tính).
 *
 * Bật sẵn; người học tắt được khi muốn bài "sạch". Lựa chọn nhớ theo trình duyệt
 * — chỉ là sở thích hiển thị, không phải dữ liệu học, nên localStorage là đủ.
 */
const KHOA = 'levelup.nhamYeu';

function docBat() {
    try { return localStorage.getItem(KHOA) !== '0'; } catch { return true; }
}

export function useNhamYeu() {
    const [bat, setBat] = useState(docBat);
    const doi = () => setBat((b) => {
        try { localStorage.setItem(KHOA, b ? '0' : '1'); } catch { /* chế độ riêng tư: chỉ nhớ trong phiên */ }
        return !b;
    });
    return [bat, doi];
}

/** Công tắc ở màn thiết lập. Chỉ có tác dụng với tiếng Anh (bộ phân loại lỗi tiếng Anh). */
export function NutNhamYeu({ bat, onDoi }) {
    return (
        <div className="nham-yeu-wrap">
            <button
                type="button"
                className={`nham-yeu${bat ? ' is-on' : ''}`}
                onClick={onDoi}
                aria-pressed={bat}
                title="AI cài vào bài vài chỗ cần đúng cấu trúc bạn hay sai (lấy từ Tiến bộ của tôi)"
            >
                <i className={`fas ${bat ? 'fa-toggle-on' : 'fa-toggle-off'}`}></i>
                <span>Nhắm lỗi hay mắc</span>
            </button>
            <span className="nham-yeu-note">
                {bat ? 'AI cài vài chỗ để bạn luyện đúng lỗi hay sai' : 'Tắt: bài ra như bình thường'}
            </span>
        </div>
    );
}

/**
 * Dòng nhỏ trong bài: bài này đang nhắm nhóm lỗi nào. Không có thì không hiện.
 * Là `<span>` (CSS cho xuống dòng) vì nó nằm trong tiêu đề đề bài — một `<span>`.
 */
export function NhanNham({ ds }) {
    if (!Array.isArray(ds) || ds.length === 0) return null;
    return (
        <span className="nham-yeu-nhan" title="Lấy từ các lỗi lặp lại trong bài Viết và Dịch của bạn">
            <i className="fas fa-bullseye"></i> Bài này có cài chỗ luyện: {ds.map((d) => d.vi).join(', ')}
        </span>
    );
}
