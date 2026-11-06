import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useEscapeToClose } from '@lib/useEscapeToClose.js';
import { SU_KIEN_NGU_PHAP } from '@lib/nguPhapLienKet.js';

const NguPhapTra = lazy(() => import('./NguPhapTra.jsx'));

/**
 * Ngăn tra ngữ pháp mở đè bên phải, dùng được ngay trong lúc luyện tập: màn đang làm vẫn giữ
 * nguyên nên không mất bài, không qua hỏi thoát. Không có lớp phủ để vẫn nhìn được câu hỏi.
 */
export default function NganNguPhap() {
    const [mo, setMo] = useState(false);
    const [daMo, setDaMo] = useState(false);
    const [dich, setDich] = useState(null);
    const dong = useCallback(() => setMo(false), []);
    useEscapeToClose(dong, mo);

    // Phím trong ngăn không được lọt ra bài đang làm: Cách, Enter, số đều đang là phím trả lời.
    const chanPhim = (e) => {
        e.stopPropagation();
        if (e.type === 'keydown' && e.key === 'Escape') dong();
    };

    useEffect(() => {
        const nghe = (e) => {
            setDich({ ...(e.detail || {}), lan: Date.now() });
            setDaMo(true); // chỉ tải phần tra cứu sau lần mở đầu tiên
            setMo(true);
        };
        window.addEventListener(SU_KIEN_NGU_PHAP, nghe);
        return () => window.removeEventListener(SU_KIEN_NGU_PHAP, nghe);
    }, []);

    if (!daMo) return null;
    return (
        <aside
            className={`np-ngan ${mo ? 'is-mo' : ''}`}
            aria-label="Tra công thức ngữ pháp"
            aria-hidden={!mo}
            onKeyDown={chanPhim}
            onKeyUp={chanPhim}
        >
            <div className="np-ngan-dau">
                <strong><i className="fas fa-spell-check"></i> Công thức ngữ pháp</strong>
                <button type="button" className="icon-btn" aria-label="Đóng" onClick={dong}>
                    <i className="fas fa-xmark"></i>
                </button>
            </div>
            <div className="np-ngan-than">
                <Suspense fallback={<p className="px-mo-ta"><i className="fas fa-spinner fa-spin"></i> Đang tải…</p>}>
                    <NguPhapTra active={mo} dich={dich} />
                </Suspense>
            </div>
        </aside>
    );
}
