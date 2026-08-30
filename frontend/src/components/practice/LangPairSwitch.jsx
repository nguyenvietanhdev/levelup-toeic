import { useState, useRef, useEffect } from 'react';
import { GameState } from '@game/state.js';
import { GameLogic } from '@game/gameLogic.js';
import { Notification } from '@ui/Toaster.jsx';
import { Modal } from '@ui/Modal.jsx';
import { PracticeManager } from './practiceManager.js';

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

    /** Ghi lựa chọn xuống localStorage + hồ sơ server. */
    const luuLuaChon = (daoMoi) => {
        setDao(daoMoi);
        // localStorage cho `gameLogic.isReversed()` (đọc đồng bộ), GameState để
        // đồng bộ lên server — thiếu vế sau là máy khác không thấy lựa chọn này.
        try { localStorage.setItem('reverseMode', String(daoMoi)); } catch {}
        if (GameState.state?.settings) {
            GameState.state.settings.reverseMode = daoMoi;
            GameState.save?.();
        }
    };

    const nhanCap = (d) => `${d ? TEN_DAP[kho] : TEN_KHO[kho]} → ${d ? TEN_KHO[kho] : TEN_DAP[kho]}`;

    const chon = (daoMoi) => {
        setMo(false);
        if (daoMoi === dao) return;

        // Ngoài lượt luyện tập (vd đứng ở màn khác) → đổi thẳng, không hỏi:
        // không có lượt nào đang dở để mà giữ.
        const dangLuyen = !!PracticeManager.currentSession?.mode;
        if (!dangLuyen) {
            luuLuaChon(daoMoi);
            Notification.success(`Đã đổi sang ${nhanCap(daoMoi)}`);
            return;
        }

        /*
         * HỎI TRƯỚC, vì hai lựa chọn có hậu quả khác hẳn nhau.
         *
         * Bản cũ ghi thẳng lựa chọn rồi báo "áp dụng từ câu sau" — câu đó KHÔNG
         * ĐÚNG với phần lớn chế độ: chúng sinh trọn bộ câu hỏi từ đầu lượt
         * (`generateQuestions`), nên đổi giữa chừng không đổi được câu nào của
         * lượt này. Người dùng đọc thông báo rồi chờ câu sau mà chẳng thấy gì.
         *
         * Muốn đổi THẬT thì phải chạy lại lượt — mà chạy lại là mất tiến độ
         * đang có, nên đó là việc phải hỏi chứ không tự quyết.
         */
        Modal.show({
            title: '🔄 Đảo chiều ngôn ngữ',
            closeOnBackdrop: false,
            content: `
                <div style="padding:4px 0;line-height:1.6">
                    <p style="margin:0 0 10px">
                        Bạn vừa chọn <strong>${nhanCap(daoMoi)}</strong>, trong khi
                        một lượt luyện tập đang dở.
                    </p>
                    <p style="margin:0 0 6px">
                        <strong>Giữ lượt này</strong> — lượt đang chạy vẫn theo chiều
                        <strong>${nhanCap(dao)}</strong> như cũ. Chiều mới áp dụng ở
                        lượt sau (làm xong, ra trang chủ rồi vào luyện tập lại).
                    </p>
                    <p style="margin:0;color:var(--text-secondary)">
                        <strong>Đổi ngay</strong> — chạy lại lượt này theo chiều mới.
                        <span style="color:var(--error-color,#ef4444)">Tiến độ của lượt
                        đang dở sẽ mất.</span>
                    </p>
                </div>`,
            buttons: [
                {
                    text: 'Giữ lượt này',
                    className: 'btn-secondary',
                    onClick: () => {
                        // KHOÁ chiều CŨ cho tới hết lượt. Chỉ ghi lựa chọn mà
                        // không khoá thì lượt đang chạy nửa cũ nửa mới: câu đã
                        // sinh theo chiều cũ, còn chỗ chấm điểm hỏi lại
                        // `isReversed()` và nhận chiều mới.
                        GameLogic.khoaDaoPhien(dao);
                        luuLuaChon(daoMoi);
                        Notification.success(
                            `Đã lưu ${nhanCap(daoMoi)} — áp dụng từ lượt sau`);
                    },
                },
                {
                    text: 'Đổi ngay',
                    className: 'btn-primary',
                    onClick: () => {
                        const mode = PracticeManager.currentSession?.mode;
                        GameLogic.boKhoaDaoPhien();
                        luuLuaChon(daoMoi);
                        // Chạy lại lượt: câu hỏi sinh lại theo chiều mới.
                        // `start()` tự bỏ khoá lần nữa, gọi ở đây chỉ để phòng
                        // trường hợp `mode` rỗng và không chạy lại được.
                        PracticeManager.cleanupCurrentMode?.();
                        PracticeManager.cleanupKeyboardShortcuts?.();
                        PracticeManager.currentSession = null;
                        if (mode) PracticeManager.start(mode);
                    },
                },
            ],
        });
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
