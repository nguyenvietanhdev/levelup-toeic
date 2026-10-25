import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGame } from '@game/GameContext.jsx';
import { NHOM_PHIM_TAT, SU_KIEN_MO, xepTheoMan } from '@lib/phimTat.js';

/**
 * Sổ tay phím tắt — mở bằng phím `?` ở bất kỳ đâu, hoặc mục "Phím tắt" trong menu.
 *
 * Lớp phủ riêng (portal), KHÔNG dùng khe modal chung: mở sổ tay giữa lúc đang có
 * popup khác thì không được đè mất popup đó. Cũng không đổi màn — đang luyện mà
 * bấm `?` thì xem xong đóng lại là làm tiếp, không bị hỏi "Thoát luyện tập?".
 */
function laDangGo(el) {
    return !!el?.closest?.('input, textarea, select, [contenteditable="true"]');
}

function Phim({ ds }) {
    return ds.map((k, i) => (
        <span key={`${k}-${i}`}>
            {i > 0 && <span className="pt-cong">+</span>}
            <kbd className="pt-kbd">{k}</kbd>
        </span>
    ));
}

export default function SoTayPhimTat() {
    const { currentScreen } = useGame();
    const [mo, setMo] = useState(false);

    useEffect(() => {
        const moRa = () => setMo(true);
        const onKey = (e) => {
            // `?` = Shift + / trên bàn phím US; đọc `e.key` để đúng mọi kiểu bàn phím.
            if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
            if (laDangGo(e.target)) return;
            e.preventDefault();
            // Chỉ MỞ ở đây; đóng bằng `?` do `giuPhim` lo (nó chặn phím trước khi tới đây).
            setMo(true);
        };
        window.addEventListener(SU_KIEN_MO, moRa);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener(SU_KIEN_MO, moRa);
            window.removeEventListener('keydown', onKey);
        };
    }, []);

    // Đang mở thì sổ tay GIỮ bàn phím: bắt ở pha capture của `window` (chạy trước
    // mọi listener của các chế độ) và chặn lan. Không thì bấm Cách để đọc thử lại
    // lật luôn thẻ Flashcard bên dưới, Esc đóng luôn popup bên dưới.
    // Esc hoặc `?` đóng sổ tay.
    useEffect(() => {
        if (!mo) return undefined;
        const giuPhim = (e) => {
            e.stopPropagation();
            if (e.key === 'Escape' || e.key === '?') {
                e.preventDefault();
                setMo(false);
            }
        };
        window.addEventListener('keydown', giuPhim, true);
        window.addEventListener('keyup', giuPhim, true);
        return () => {
            window.removeEventListener('keydown', giuPhim, true);
            window.removeEventListener('keyup', giuPhim, true);
        };
    }, [mo]);

    if (!mo) return null;

    const nhom = xepTheoMan(NHOM_PHIM_TAT, currentScreen);

    return createPortal(
        <div className="pt-phu" onClick={() => setMo(false)}>
            <div
                className="pt-hop"
                role="dialog"
                aria-modal="true"
                aria-labelledby="pt-tieu-de"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="pt-dau">
                    <h2 id="pt-tieu-de"><i className="fas fa-keyboard"></i> Phím tắt</h2>
                    <button type="button" className="icon-btn" onClick={() => setMo(false)} aria-label="Đóng">
                        <i className="fas fa-times"></i>
                    </button>
                </div>
                <p className="pt-goi-y">
                    Bấm <kbd className="pt-kbd">?</kbd> ở bất kỳ đâu để mở lại. Phím tắt không chạy khi con trỏ đang ở ô nhập chữ.
                </p>
                <div className="pt-luoi">
                    {nhom.map((n) => {
                        const dangDung = n.screens.includes(currentScreen);
                        return (
                            <section key={n.key} className={`pt-nhom${dangDung ? ' is-dang-dung' : ''}`}>
                                <h3>
                                    <i className={`fas ${n.icon}`}></i> {n.ten}
                                    {dangDung && <span className="pt-nhan">Màn này</span>}
                                </h3>
                                <ul>
                                    {n.phim.map((p) => (
                                        <li key={`${p.phim.join('+')}-${p.viec}`}>
                                            <span className="pt-phim">
                                                <Phim ds={p.phim} />
                                                {p.hoac && <><span className="pt-hoac">hoặc</span><Phim ds={p.hoac} /></>}
                                            </span>
                                            <span className="pt-viec">
                                                {p.viec}
                                                {p.ghiChu && <small>{p.ghiChu}</small>}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        );
                    })}
                </div>
            </div>
        </div>,
        document.body,
    );
}
