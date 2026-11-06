import { useEffect, useState } from 'react';
import { useGame } from '@game/GameContext.jsx';
import { loadUnlocks, lockInfo } from '@game/featureUnlocks.js';
import { moNguPhap } from '@lib/nguPhapLienKet.js';

const DIEM_MUC_TIEU = [0, 450, 550, 650, 750, 850, 900];
const DO_TIN_CAY = { cao: 'Độ tin cậy cao', 'trung-binh': 'Độ tin cậy trung bình', thap: 'Độ tin cậy thấp' };

/** Tên màu của thanh Part, theo tỉ lệ đúng. */
function mucCua(p) {
    if (!p.duDuLieu) return 'chua-du';
    if (p.doChinhXac < 50) return 'yeu';
    return p.doChinhXac < 75 ? 'dang-len' : 'vung';
}

/**
 * Hồ sơ mục tiêu TOEIC: điểm dự đoán, khoảng cách tới mục tiêu, trình độ từng Part và Part
 * nên luyện tiếp theo. Số liệu tính từ các bài Mini/Full Test đã làm ở server.
 */
export default function PanelToeic({ toeic, dang, onDatDiem }) {
    const { showScreen } = useGame();
    const [, setMoKhoa] = useState(0);

    useEffect(() => {
        let huy = false;
        loadUnlocks(true).then(() => { if (!huy) setMoKhoa((t) => t + 1); });
        return () => { huy = true; };
    }, []);

    if (!toeic) return null;
    const { duDoan, trongTam, parts, diemMucTieu, soBai } = toeic;
    const coDuDoan = duDoan?.enough && duDoan.predicted;
    const khoa = lockInfo('feature:toeic');

    /** Mở màn TOEIC đúng tab và đúng Part. */
    const moDe = (dich) => {
        try { sessionStorage.setItem('levelup.toeic.moi', String(dich)); } catch { /* mở tab mặc định */ }
        showScreen('toeic-screen');
    };

    return (
        <>
            <div className="px-so">
                <div>
                    <strong>{coDuDoan ? duDoan.predicted.mid : '—'}</strong>
                    <span>{coDuDoan ? `Dự đoán ${duDoan.predicted.low}–${duDoan.predicted.high}` : 'Chưa đủ để dự đoán'}</span>
                </div>
                <div>
                    <strong>{diemMucTieu || '—'}</strong>
                    <span>Điểm mục tiêu</span>
                </div>
                <div>
                    <strong>{coDuDoan && diemMucTieu ? (duDoan.reachedTarget ? 'Đạt' : `+${duDoan.gap}`) : '—'}</strong>
                    <span>{coDuDoan && diemMucTieu ? 'Còn cách mục tiêu' : `Đã làm ${soBai} bài`}</span>
                </div>
            </div>
            {coDuDoan && DO_TIN_CAY[duDoan.confidence] && (
                <p className="px-goi-y">{DO_TIN_CAY[duDoan.confidence]}. Làm càng nhiều đề thì dự đoán càng sát.</p>
            )}

            <label className="hs-chon-diem">
                <span>Điểm muốn đạt</span>
                <select
                    value={DIEM_MUC_TIEU.includes(diemMucTieu) ? diemMucTieu : 0}
                    disabled={dang}
                    onChange={(e) => onDatDiem(Number(e.target.value))}
                >
                    {DIEM_MUC_TIEU.map((d) => <option key={d} value={d}>{d || 'Chưa đặt'}</option>)}
                </select>
            </label>

            {trongTam && (
                <section className="hs-trong-tam">
                    <h3 className="hs-tieu-de hs-tieu-de-dau">Nên luyện tiếp theo: Part {trongTam.part} · {trongTam.ten}</h3>
                    <p className="px-mo-ta">{trongTam.lyDo}</p>
                    <p className="px-goi-y">{trongTam.viec}</p>
                    <div className="px-nut">
                        {khoa.locked ? (
                            <span className="lt-khoa"><i className="fas fa-lock"></i> Mở ở Level {khoa.requiredLevel}</span>
                        ) : (
                            <>
                                <button type="button" className="btn btn-primary" onClick={() => moDe(trongTam.part)}>
                                    <i className="fas fa-play"></i> Luyện Part {trongTam.part}
                                </button>
                                <button type="button" className="btn btn-secondary" onClick={() => moDe('full')}>Làm Full Test</button>
                            </>
                        )}
                        {trongTam.canNguPhap && (
                            <button type="button" className="btn btn-secondary" onClick={() => moNguPhap()}>
                                <i className="fas fa-spell-check"></i> Tra ngữ pháp
                            </button>
                        )}
                    </div>
                </section>
            )}

            <h3 className="hs-tieu-de">Từng Part</h3>
            <ul className="hs-ky-nang">
                {parts.map((p) => {
                    const muc = mucCua(p);
                    return (
                        <li key={p.part}>
                            <div className="hs-ky-nang-dau">
                                <span>Part {p.part} · {p.ten}</span>
                                <span className={`hs-nhan is-${muc}`}>
                                    {p.duDuLieu ? `${p.doChinhXac}% · mất ~${p.cauMat}/${p.soCauChuan} câu` : 'Chưa đủ dữ liệu'}
                                </span>
                            </div>
                            {p.duDuLieu && <div className="hs-thanh"><span className={`is-${muc}`} style={{ width: `${p.doChinhXac}%` }}></span></div>}
                        </li>
                    );
                })}
            </ul>
        </>
    );
}
