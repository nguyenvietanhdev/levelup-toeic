import { useEffect, useMemo } from 'react';
import { useGame } from '@game/GameContext.jsx';
import { buildUploadContent } from './openUploadModal.js';

/**
 * Màn "Từ vựng riêng" — một tab của menu bên, KHÔNG phải popup.
 *
 * Trước đây nó là modal nổi. Popup hợp cho việc làm nhanh rồi đóng, nhưng màn
 * này có 5 tab và người dùng ở lại lâu (thêm từ, dán JSON, quản lý, chia sẻ,
 * duyệt bộ được chia sẻ) — nó là một nơi để ĐẾN, không phải một hộp thoại.
 *
 * Ruột giữ nguyên: `buildUploadContent()` trả về đúng phần thân mà modal vẫn
 * dùng, nên không có hai bản logic song song.
 */
export default function VocabScreen({ active }) {
    const { showScreen } = useGame();

    // Dựng LẠI mỗi lần vào màn: các hàm `load*` bên trong đọc dữ liệu ngay lúc
    // dựng, nên giữ nguyên một bản là quay lại màn vẫn thấy số liệu của lần
    // trước (bộ từ vừa thêm không xuất hiện).
    //
    // `useMemo` theo `active` là đủ — `active` chuyển false→true mỗi lần vào
    // màn, memo tính lại đúng lúc đó. Không cần biến đếm + `setState` trong
    // effect: cái đó thêm một lượt render thừa và eslint bắt (cascading renders).
    const built = useMemo(
        () => (active ? buildUploadContent({}) : null),
        [active],
    );

    // `dispose` gỡ listener uỷ quyền ở document. Bỏ qua là mỗi lần vào màn lại
    // chồng thêm một listener, cái cũ trỏ vào DOM đã bị React vứt.
    useEffect(() => () => built?.dispose?.(), [built]);

    if (!active) return null;

    return (
        <div id="vocab-screen" className="screen active">
            <div className="screen-header">
                <button className="back-btn-screen icon-btn" onClick={() => showScreen('home-screen')}>
                    <i className="fas fa-arrow-left"></i>
                </button>
                <h2><i className="fas fa-cloud-upload-alt"></i> Từ vựng riêng</h2>
                {/* Cụm nút của chính màn (Đồng bộ · thời hạn lưu · Quản lý) —
                    trước nằm ở header modal, giờ vào hàng tiêu đề màn. */}
                <div
                    className="vocab-screen-actions"
                    dangerouslySetInnerHTML={{ __html: built?.headerActionHtml || '' }}
                />
            </div>

            <div className="settings-section vocab-screen-body">
                {built?.contentJsx}
            </div>
        </div>
    );
}
