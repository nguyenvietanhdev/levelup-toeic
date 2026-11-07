import { useEffect, useState } from 'react';
import { useGame } from '@game/GameContext.jsx';
import { loadUnlocks, lockInfo } from '@game/featureUnlocks.js';

/** Màn luyện của từng kỹ năng; Viết và Nói mở với đúng kiểu chấm của mục tiêu. */
const MAN = {
    viet: { screen: 'essay-screen', feature: 'feature:essay', kieuCham: true },
    noi: { screen: 'voice-conversation-screen', feature: 'feature:conversation', kieuCham: true },
    doc: { screen: 'reading-screen', feature: 'feature:reading' },
    nghe: { screen: 'listening-screen', feature: null },
};
const MUC_TIEU = {
    ielts: { nhan: 'Band muốn đạt', ds: [0, 5, 5.5, 6, 6.5, 7, 7.5, 8], hien: (d) => (d ? d.toFixed(1) : 'Chưa đặt') },
    hsk: { nhan: 'Cấp muốn đạt', ds: [0, 1, 2, 3, 4, 5, 6], hien: (d) => (d ? `HSK ${d}` : 'Chưa đặt') },
};

/** Mở màn luyện một kỹ năng; Viết và Nói đặt sẵn kiểu chấm để bài được tính cho mục tiêu. */
export function moKyNang(showScreen, key, rubric) {
    const m = MAN[key];
    if (!m) return;
    if (m.kieuCham) {
        try { sessionStorage.setItem('levelup.kieuCham', rubric); } catch { /* dùng kiểu mặc định */ }
    }
    showScreen(m.screen);
}

/**
 * Hồ sơ mục tiêu IELTS hoặc HSK: 4 kỹ năng đọc từ bài đã làm. Viết và Nói theo đúng tiêu chí của
 * mục tiêu; Đọc và Nghe chỉ là % ở bài luyện, không quy ra band hay cấp.
 */
export default function PanelBang({ bang, dang, onDatDiem }) {
    const { showScreen } = useGame();
    const [, setMoKhoa] = useState(0);

    useEffect(() => {
        let huy = false;
        loadUnlocks(true).then(() => { if (!huy) setMoKhoa((t) => t + 1); });
        return () => { huy = true; };
    }, []);

    if (!bang) return null;
    const mt = MUC_TIEU[bang.mucTieu];
    const tt = bang.trongTam;

    const NutLuyen = ({ k, chinh }) => {
        const m = MAN[k.key];
        const khoa = m?.feature ? lockInfo(m.feature) : { locked: false };
        if (khoa.locked) return <span className="lt-khoa"><i className="fas fa-lock"></i> Mở ở Level {khoa.requiredLevel}</span>;
        return (
            <button type="button" className={`btn ${chinh ? 'btn-primary' : 'btn-secondary'}`} onClick={() => moKyNang(showScreen, k.key, bang.rubric)}>
                {chinh && <i className="fas fa-play"></i>} Luyện {k.ten}
            </button>
        );
    };

    return (
        <>
            <div className="px-so">
                <div>
                    <strong>{bang.uocLuong !== null && bang.uocLuong !== undefined ? bang.uocLuong.toFixed(1) : '—'}</strong>
                    <span>{bang.mucTieu === 'ielts' ? 'Band ước lượng (Viết, Nói)' : 'HSK không quy đổi ra cấp'}</span>
                </div>
                <div><strong>{mt.hien(bang.diemMucTieu)}</strong><span>{mt.nhan}</span></div>
                <div><strong>{bang.kyNang.filter((k) => k.duDuLieu).length}/4</strong><span>Kỹ năng đã đo</span></div>
            </div>

            <label className="hs-chon-diem">
                <span>{mt.nhan}</span>
                <select
                    value={mt.ds.includes(bang.diemMucTieu) ? bang.diemMucTieu : 0}
                    disabled={dang}
                    onChange={(e) => onDatDiem(Number(e.target.value))}
                >
                    {mt.ds.map((d) => <option key={d} value={d}>{mt.hien(d)}</option>)}
                </select>
            </label>

            {tt && (
                <section className="hs-trong-tam">
                    <h3 className="hs-tieu-de hs-tieu-de-dau">Nên luyện tiếp theo: {tt.ten}</h3>
                    <p className="px-mo-ta">{tt.lyDo}</p>
                    <div className="px-nut"><NutLuyen k={tt} chinh /></div>
                </section>
            )}

            <h3 className="hs-tieu-de">4 kỹ năng</h3>
            <ul className="hs-ky-nang">
                {bang.kyNang.map((k) => (
                    <li key={k.key}>
                        <div className="hs-ky-nang-dau">
                            <span>{k.ten}{k.donVi === '%' ? ' (bài luyện)' : ` (chấm theo ${bang.ten})`}</span>
                            <span className="hs-nhan">{k.duDuLieu ? `${k.diem}${k.donVi}` : `Chưa đủ dữ liệu · ${k.soBai} bài`}</span>
                        </div>
                        {k.duDuLieu && (
                            <div className="hs-thanh">
                                <span style={{ width: `${k.donVi === '/9' ? (k.diem / 9) * 100 : k.diem}%` }}></span>
                            </div>
                        )}
                    </li>
                ))}
            </ul>
            <p className="px-goi-y">
                Đọc và Nghe chỉ là phần trăm đúng ở bài luyện của app, không phải đề {bang.ten} nên không quy ra {bang.mucTieu === 'ielts' ? 'band' : 'cấp'}.
                Bài Viết, Nói phải chấm theo tiêu chí {bang.ten} mới được tính; nút Luyện ở đây đã chọn sẵn kiểu chấm đó.
            </p>
        </>
    );
}
