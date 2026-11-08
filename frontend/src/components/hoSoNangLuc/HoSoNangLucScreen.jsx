import { useEffect, useState } from 'react';
import { useGame } from '@game/GameContext.jsx';
import { useAuth } from '@components/auth/AuthContext.jsx';
import { loadUnlocks, lockInfo } from '@game/featureUnlocks.js';
import { HoSoNangLucAPI } from '@api/hoSoNangLuc.js';
import { moNguPhap, nguPhapChoLoi } from '@lib/nguPhapLienKet.js';

const TEN_MUC_TIEU = { 'giao-tiep': 'Giao tiếp', toeic: 'TOEIC', ielts: 'IELTS', hsk: 'HSK' };
const MUI_TEN = { len: 'fa-arrow-trend-up', xuong: 'fa-arrow-trend-down', ngang: 'fa-minus' };
const NHAN_MUC = { yeu: 'Cần luyện', 'dang-len': 'Đang lên', vung: 'Vững', 'chua-du': 'Chưa đủ dữ liệu' };

/** Kỹ năng chính → màn luyện, có khoá Level như menu. */
const MAN_KY_NANG = {
    'tu-vung': { screen: 'home-screen' },
    nghe: { screen: 'listening-screen' },
    doc: { screen: 'reading-screen', feature: 'feature:reading' },
    noi: { screen: 'voice-conversation-screen', feature: 'feature:conversation' },
    viet: { screen: 'essay-screen', feature: 'feature:essay' },
    dich: { screen: 'translation-screen', feature: 'feature:translation' },
};
const KHUNG_PHAN_XA = new Set(['khung-cau', 'qua-khu', 'tell-say-talk', 'mau-giao-tiep']);
/** Dưới mức này một con số chỉ là vài bài, chưa phải trình độ: hiện mờ và ghi rõ. */
const LUOT_TOI_THIEU = 3;
/**
 * Tên rõ hơn cho trang này: cùng chữ "Nghe" mà Tiến bộ đo chép lại cả đoạn, còn hồ sơ trình độ
 * đo nghe hiểu câu ngắn. Để chung một tên thì "Nghe 30%" và "Nghe vững 82" trông như mâu thuẫn.
 */
const TEN_RO = { nghe: 'Nghe chép đoạn', doc: 'Đọc hiểu đoạn' };

/**
 * Hồ sơ năng lực — một trang gộp mọi thứ hệ thống biết về người học. Mọi con số tính ở server từ
 * nguồn đã có; điểm mạnh và điểm cần cải thiện có nút mở thẳng chỗ luyện tương ứng.
 */
export default function HoSoNangLucScreen({ active }) {
    const { showScreen } = useGame();
    const { isLoggedIn } = useAuth();
    const [data, setData] = useState(null);
    const [loi, setLoi] = useState('');
    const [, setMoKhoa] = useState(0);

    useEffect(() => {
        if (!active || !isLoggedIn) return undefined;
        let huy = false;
        setLoi('');
        HoSoNangLucAPI.get()
            .then((d) => { if (!huy) setData(d); })
            .catch((e) => { if (!huy) setLoi(e?.message || 'Không tải được hồ sơ năng lực'); });
        loadUnlocks(true).then(() => { if (!huy) setMoKhoa((t) => t + 1); });
        return () => { huy = true; };
    }, [active, isLoggedIn]);

    /** Nơi luyện cho một điểm mạnh hoặc điểm cần cải thiện; null = không có nút. */
    const choLuyen = (x) => {
        const ganKhoa = (dich, chay) => {
            const k = dich.feature ? lockInfo(dich.feature) : { locked: false };
            return k.locked ? { khoa: k.requiredLevel } : { chay };
        };
        if (x.loai === 'ky-nang-con' && KHUNG_PHAN_XA.has(x.key)) {
            return {
                chay: () => {
                    try { sessionStorage.setItem('levelup.phanXa.khung', x.key); } catch { /* mở tổng quan */ }
                    showScreen('phan-xa-screen');
                },
            };
        }
        if (x.loai === 'ky-nang-con' && x.key === 'nghe') return { chay: () => showScreen('listening-screen') };
        if (x.loai === 'ky-nang-con' && x.key === 'noi') return ganKhoa(MAN_KY_NANG.noi, () => showScreen(MAN_KY_NANG.noi.screen));
        if (x.loai === 'ky-nang' && MAN_KY_NANG[x.key]) return ganKhoa(MAN_KY_NANG[x.key], () => showScreen(MAN_KY_NANG[x.key].screen));
        if (x.loai === 'loi' && nguPhapChoLoi(x.key)) return { chay: () => moNguPhap(nguPhapChoLoi(x.key)) };
        if (x.loai === 'toeic-part') {
            return ganKhoa({ feature: 'feature:toeic' }, () => {
                try { sessionStorage.setItem('levelup.toeic.moi', String(x.key)); } catch { /* mở tab mặc định */ }
                showScreen('toeic-screen');
            });
        }
        return null;
    };

    const DongNhanXet = ({ x }) => {
        const l = choLuyen(x);
        return (
            <li>
                <span>{x.chu}</span>
                {l?.chay && <button type="button" className="lt-ke-hoach-link" onClick={l.chay}>Luyện</button>}
                {l?.khoa && <span className="lt-khoa"><i className="fas fa-lock"></i> Level {l.khoa}</span>}
            </li>
        );
    };

    const tq = data?.tongQuan;
    const tt = data?.thanhTich;
    const td = data?.toeic?.duDoan;

    return (
        <div id="ho-so-nang-luc-screen" className={`screen ${active ? 'active' : ''}`}>
            <div className="screen-header">
                <button className="back-btn-screen icon-btn" onClick={() => showScreen('home-screen')}>
                    <i className="fas fa-arrow-left"></i>
                </button>
                <h2><i className="fas fa-id-card"></i> Hồ sơ năng lực</h2>
            </div>

            <div className="px-wrap">
                {!isLoggedIn && <p className="px-mo-ta">Đăng nhập để xem hồ sơ năng lực.</p>}
                {loi && <p className="px-mo-ta">{loi}</p>}
                {isLoggedIn && !data && !loi && <p className="px-mo-ta"><i className="fas fa-spinner fa-spin"></i> Đang tải…</p>}

                {data && (
                    <>
                        <div className="nl-dau">
                            <div><strong>{tq.trinhDo.nhan}</strong><span>Trình độ{tq.trinhDo.diem ? ` · ${tq.trinhDo.diem}/100` : ''}</span></div>
                            <div><strong>{TEN_MUC_TIEU[tq.mucTieu] || '—'}</strong><span>Mục tiêu</span></div>
                            <div><strong>{tq.level}</strong><span>Level</span></div>
                            <div><strong>{tq.streak}</strong><span>Ngày liên tục</span></div>
                        </div>

                        {!data.coDuLieu && (
                            <div className="hs-trong-tam">
                                <p className="px-mo-ta">Hệ thống chưa đủ dữ liệu để đánh giá. Làm bài test trình độ khoảng 8 phút để bắt đầu.</p>
                                <div className="px-nut">
                                    <button type="button" className="btn btn-primary" onClick={() => showScreen('ho-so-hoc-screen')}>
                                        <i className="fas fa-bullseye"></i> Làm test trình độ
                                    </button>
                                </div>
                            </div>
                        )}

                        {(data.diemManh.length > 0 || data.canCaiThien.length > 0) && (
                            <div className="nl-nhan-xet">
                                <section>
                                    <h3 className="hs-tieu-de"><i className="fas fa-star"></i> Điểm mạnh</h3>
                                    {data.diemManh.length
                                        ? <ul className="nl-ds">{data.diemManh.map((x) => <DongNhanXet key={`${x.loai}${x.key}`} x={x} />)}</ul>
                                        : <p className="px-goi-y">Chưa đủ dữ liệu để chỉ ra điểm mạnh.</p>}
                                </section>
                                <section>
                                    <h3 className="hs-tieu-de"><i className="fas fa-bullseye"></i> Cần cải thiện</h3>
                                    {data.canCaiThien.length
                                        ? <ul className="nl-ds">{data.canCaiThien.map((x) => <DongNhanXet key={`${x.loai}${x.key}`} x={x} />)}</ul>
                                        : <p className="px-goi-y">Chưa thấy điểm yếu rõ ràng.</p>}
                                </section>
                            </div>
                        )}

                        {data.kyNang.some((k) => k.soLuot > 0) && (
                            <>
                                <h3 className="hs-tieu-de">Kỹ năng · 8 tuần gần đây</h3>
                                <div className="nl-ky-nang">
                                    {data.kyNang.map((k) => (
                                        <div key={k.key} className={k.soLuot >= LUOT_TOI_THIEU ? '' : 'is-trong'}>
                                            <span><i className={`fas ${k.icon}`}></i> {TEN_RO[k.key] || k.ten}</span>
                                            <strong>
                                                {k.ganDay !== null && k.ganDay !== undefined ? `${k.ganDay}${k.donVi}` : '—'}
                                                {MUI_TEN[k.xuHuong] && <i className={`fas ${MUI_TEN[k.xuHuong]} nl-xu-huong is-${k.xuHuong}`}></i>}
                                            </strong>
                                            <small>{k.soLuot >= LUOT_TOI_THIEU ? `${k.soLuot} lượt` : `${k.soLuot} lượt · ít dữ liệu`}</small>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}

                        {data.kyNangCon.some((k) => k.duDuLieu) && (
                            <>
                                <h3 className="hs-tieu-de">Kỹ năng giao tiếp</h3>
                                <ul className="hs-ky-nang">
                                    {data.kyNangCon.map((k) => (
                                        <li key={k.key}>
                                            <div className="hs-ky-nang-dau">
                                                <span><i className={`fas ${k.icon}`}></i> {k.ten}</span>
                                                <span className={`hs-nhan is-${k.muc}`}>{NHAN_MUC[k.muc]}</span>
                                            </div>
                                            {k.duDuLieu && <div className="hs-thanh"><span className={`is-${k.muc}`} style={{ width: `${k.diem}%` }}></span></div>}
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}

                        {data.toeic && (
                            <>
                                <h3 className="hs-tieu-de">TOEIC</h3>
                                <div className="px-so">
                                    <div>
                                        <strong>{td?.enough ? td.predicted.mid : '—'}</strong>
                                        <span>{td?.enough ? `Dự đoán ${td.predicted.low}–${td.predicted.high}` : (td?.reason || 'Chưa đủ để dự đoán')}</span>
                                    </div>
                                    <div><strong>{data.toeic.diemMucTieu || '—'}</strong><span>Điểm mục tiêu</span></div>
                                    <div><strong>{data.toeic.soBai}</strong><span>Bài đã làm</span></div>
                                </div>
                            </>
                        )}

                        {data.bang && (
                            <>
                                <h3 className="hs-tieu-de">{data.bang.ten}</h3>
                                <div className="nl-ky-nang">
                                    {data.bang.kyNang.map((k) => (
                                        <div key={k.key} className={k.duDuLieu ? '' : 'is-trong'}>
                                            <span>{k.ten}</span>
                                            <strong>{k.duDuLieu ? `${k.diem}${k.donVi}` : '—'}</strong>
                                            <small>{k.duDuLieu ? `${k.soBai} bài` : 'chưa đủ dữ liệu'}</small>
                                        </div>
                                    ))}
                                </div>
                                {data.bang.uocLuong !== null && data.bang.uocLuong !== undefined && (
                                    <p className="px-goi-y">Band ước lượng từ Viết và Nói: <strong>{Number(data.bang.uocLuong).toFixed(1)}</strong></p>
                                )}
                            </>
                        )}

                        <h3 className="hs-tieu-de">Đã thuộc</h3>
                        <div className="nl-thanh-tich">
                            <div><strong>{tt.tuDaThuoc}</strong><span>Từ vựng</span><small>{tt.tuDangOn} từ đang ôn</small></div>
                            <div><strong>{tt.nguPhapDaThuoc}/{tt.nguPhapTong}</strong><span>Công thức ngữ pháp</span><small>Đã luyện {tt.nguPhapDaLuyen} mục</small></div>
                            <div><strong>{tt.phanXaDaThuoc}/{tt.phanXaTong}</strong><span>Câu phản xạ</span></div>
                        </div>

                        <div className="px-nut">
                            <button type="button" className="btn btn-secondary" onClick={() => showScreen('tien-bo-screen')}>
                                <i className="fas fa-chart-line"></i> Xu hướng chi tiết
                            </button>
                            <button type="button" className="btn btn-secondary" onClick={() => showScreen('ho-so-hoc-screen')}>
                                <i className="fas fa-bullseye"></i> Mục tiêu &amp; bài test
                            </button>
                        </div>
                        <p className="px-goi-y">Mọi con số được tính từ bài bạn đã làm. Hệ thống chỉ nhận xét khi đủ dữ liệu.</p>
                    </>
                )}
            </div>
        </div>
    );
}
