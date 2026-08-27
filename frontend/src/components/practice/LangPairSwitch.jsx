import { useState, useRef, useEffect } from 'react';
import { GameState } from '@game/state.js';
import { Notification } from '@ui/Toaster.jsx';

/**
 * ĐỔI CẶP HỌC ngay khi đang luyện tập.
 *
 * Trước đây đổi chiều hỏi–đáp phải vào Settings, mà đó là hai lựa chọn nằm hai
 * chỗ khác nhau: "ngôn ngữ học" (kho) và "chiều luyện tập" (xuôi/ngược). Người
 * dùng nghĩ theo CẶP — "Trung sang Việt", "Trung sang Anh" — chứ không nghĩ
 * theo hai trục rời.
 *
 * Ở đây gộp lại: một danh sách cặp, chọn phát ra ngay.
 *
 * Vì sao đặt trên thanh luyện tập: đổi kho phải RELOAD trang (kho từ nạp lúc
 * khởi động), nên nút này chỉ đổi CHIỀU — thứ đổi được tức thì. Đổi kho vẫn
 * qua dropdown trang chủ. Trộn hai thứ có chi phí khác hẳn nhau vào một danh
 * sách thì có mục bấm xong đổi ngay, có mục nạp lại cả trang — cùng một cái
 * nút mà hai hành vi là chỗ dễ mất lòng tin nhất.
 */

/** Nhãn ngắn của từng kho. */
const TEN_KHO = { en: 'EN', zh: 'ZH', bi: 'ZH' };

/** Mặt bên kia của từng kho — thứ đóng vai đáp án. */
const TEN_DAP = { en: 'VN', zh: 'VN', bi: 'EN' };

export function LangPairSwitch() {
    const [mo, setMo] = useState(false);
    const boc = useRef(null);

    const kho = GameState.state?.settings?.vocabLang || 'en';
    const [dao, setDao] = useState(() => {
        try { return localStorage.getItem('reverseMode') === 'true'; } catch { return false; }
    });

    // Bấm ra ngoài thì đóng. Không có cái này thì danh sách nằm lì trên màn
    // hình và che mất câu hỏi.
    useEffect(() => {
        if (!mo) return;
        const ngoai = (e) => { if (!boc.current?.contains(e.target)) setMo(false); };
        // `setTimeout` 0: gắn ngay trong lượt bấm hiện tại thì chính cú bấm mở
        // danh sách lại đóng nó luôn.
        const t = setTimeout(() => document.addEventListener('mousedown', ngoai), 0);
        return () => { clearTimeout(t); document.removeEventListener('mousedown', ngoai); };
    }, [mo]);

    const tu = dao ? TEN_DAP[kho] : TEN_KHO[kho];
    const sang = dao ? TEN_KHO[kho] : TEN_DAP[kho];

    const chon = (daoMoi) => {
        setMo(false);
        if (daoMoi === dao) return;

        setDao(daoMoi);
        // localStorage cho `gameLogic.isReversed()` (đọc đồng bộ), GameState để
        // đồng bộ lên server — thiếu vế sau là máy khác không thấy lựa chọn này.
        try { localStorage.setItem('reverseMode', String(daoMoi)); } catch {}
        if (GameState.state?.settings) {
            GameState.state.settings.reverseMode = daoMoi;
            GameState.save?.();
        }

        Notification.success(
            `Đổi sang ${daoMoi ? TEN_DAP[kho] : TEN_KHO[kho]} → ${daoMoi ? TEN_KHO[kho] : TEN_DAP[kho]}`
            + ' — áp dụng từ câu sau'
        );
    };

    const muc = [
        { dao: false, nhan: `${TEN_KHO[kho]} → ${TEN_DAP[kho]}` },
        { dao: true, nhan: `${TEN_DAP[kho]} → ${TEN_KHO[kho]}` },
    ];

    return (
        <div className="lang-pair-switch" ref={boc}>
            <button
                type="button"
                className="lang-pair-btn"
                onClick={() => setMo((v) => !v)}
                title="Đổi chiều hỏi–đáp. Đổi bộ từ vựng thì dùng ô ngôn ngữ ở trang chủ."
            >
                <span className="lang-pair-label">{tu} → {sang}</span>
                <i className="fas fa-chevron-down" />
            </button>

            {mo && (
                <div className="lang-pair-menu">
                    {muc.map((m) => (
                        <button
                            key={String(m.dao)}
                            type="button"
                            className={`lang-pair-item ${m.dao === dao ? 'dang-chon' : ''}`}
                            onClick={() => chon(m.dao)}
                        >
                            {m.nhan}
                            {m.dao === dao && <i className="fas fa-check" />}
                        </button>
                    ))}
                    <div className="lang-pair-note">
                        Đổi bộ từ vựng ở trang chủ
                    </div>
                </div>
            )}
        </div>
    );
}
