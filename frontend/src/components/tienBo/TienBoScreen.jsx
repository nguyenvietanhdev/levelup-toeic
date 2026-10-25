import { useEffect, useState } from 'react';
import { useGame } from '@game/GameContext.jsx';
import { useAuth } from '@components/auth/AuthContext.jsx';
import { loadUnlocks, lockInfo } from '@game/featureUnlocks.js';
import { EventBus, GameEvents } from '@game/eventBus.js';
import { Notification } from '@ui/Toaster.jsx';
import { TienBoAPI } from '@api/tienBo.js';
import SoTayLoi from './SoTayLoi.jsx';

/**
 * Tiến bộ của tôi — hồ sơ năng lực gom từ MỌI chế độ, 8 tuần gần nhất.
 *
 * Lịch sử từng chế độ chỉ cho thấy từng bài; ở đây là XU HƯỚNG: kỹ năng nào lên,
 * lỗi nào bớt, chỗ nào còn yếu. Mọi con số và nhận xét do SERVER tính từ bài đã
 * làm (không phải AI đoán), và chỉ nói "tiến bộ / đi xuống" khi đủ dữ liệu.
 */

/** Bấm thẻ kỹ năng → mở thẳng chế độ luyện kỹ năng đó. */
const MAN_CUA = {
    'tu-vung': { screen: 'home-screen', feature: null },
    nghe: { screen: 'listening-screen', feature: null },
    doc: { screen: 'reading-screen', feature: 'feature:reading' },
    noi: { screen: 'voice-conversation-screen', feature: 'feature:conversation' },
    viet: { screen: 'essay-screen', feature: 'feature:essay' },
    dich: { screen: 'translation-screen', feature: 'feature:translation' },
};

/**
 * Bước của Lộ trình mà kế hoạch tuần (AI) trỏ tới → màn tương ứng. Server đã lọc
 * `buoc` về đúng các khoá này; khoá rỗng thì việc đó không có nút.
 */
const MAN_BUOC = {
    'on-sai': { mode: 'review-mistakes' },
    'hoc-tu': { screen: 'home-screen' },
    nghe: { screen: 'listening-screen' },
    doc: { screen: 'reading-screen', feature: 'feature:reading' },
    noi: { screen: 'voice-conversation-screen', feature: 'feature:conversation' },
    'viet-dich': { screen: 'essay-screen', feature: 'feature:essay' },
};

const XU_HUONG = {
    len: { nhan: 'Tiến bộ', icon: 'fa-arrow-trend-up', lop: 'is-tot' },
    xuong: { nhan: 'Đi xuống', icon: 'fa-arrow-trend-down', lop: 'is-xau' },
    ngang: { nhan: 'Ổn định', icon: 'fa-equals', lop: '' },
};

/** Lỗi ngữ pháp: ÍT lỗi hơn mới là tốt — chiều màu ngược với điểm kỹ năng. */
const XU_HUONG_LOI = {
    giam: { nhan: 'Đang bớt', icon: 'fa-arrow-trend-down', lop: 'is-tot' },
    tang: { nhan: 'Tăng lên', icon: 'fa-arrow-trend-up', lop: 'is-xau' },
    ngang: { nhan: 'Chưa đổi', icon: 'fa-equals', lop: '' },
};

const hienDiem = (gt, donVi) => (gt === null || gt === undefined ? '—' : donVi === '%' ? `${gt}%` : `${gt}`);

function NhanXuHuong({ xh, bang = XU_HUONG }) {
    const x = bang[xh];
    if (!x) return <span className="tb-xu-huong">Chưa đủ dữ liệu</span>;
    return <span className={`tb-xu-huong ${x.lop}`}><i className={`fas ${x.icon}`}></i> {x.nhan}</span>;
}

/** Cột điểm 8 tuần. Tuần chưa làm gì để trống (không phải 0 — "chưa làm" khác "làm sai hết"). */
function CotTuan({ diem, tuan, donVi }) {
    const tran = donVi === '%' ? 100 : 9;
    return (
        <div className="tb-cot-wrap" aria-hidden="true">
            {diem.map((d, i) => (
                <div key={tuan[i]} className="tb-cot" title={`Tuần từ ${tuan[i]}: ${hienDiem(d, donVi)}`}>
                    <span
                        className={d === null ? 'is-trong' : ''}
                        style={d === null ? undefined : { height: `${Math.max(6, (d / tran) * 100)}%` }}
                    />
                </div>
            ))}
        </div>
    );
}

export default function TienBoScreen({ active }) {
    const { showScreen } = useGame();
    const { isLoggedIn } = useAuth();
    const [data, setData] = useState(null);
    const [loi, setLoi] = useState('');
    // Hai tab: số liệu tiến bộ, và sổ tay lỗi (mọi chỗ đã chữa, kèm cách sửa).
    const [tab, setTab] = useState('tong-quan');
    const [, setMoKhoa] = useState(0); // vẽ lại khi đã nạp xong bảng khoá Level
    const [tongKet, setTongKet] = useState(null);
    const [dangTongKet, setDangTongKet] = useState(false);

    // Tải lại mỗi lần mở màn: vừa làm bài xong quay lại là thấy số mới.
    useEffect(() => {
        if (!active || !isLoggedIn) return undefined;
        let huy = false;
        setLoi('');
        TienBoAPI.get()
            .then((d) => { if (!huy) setData(d); })
            .catch((e) => { if (!huy) setLoi(e?.message || 'Không tải được tiến bộ'); });
        // Tổng kết tuần đã lưu (nếu có) — chỉ đọc, không gọi AI.
        TienBoAPI.tongKet()
            .then((d) => { if (!huy) setTongKet(d?.tongKet || null); })
            .catch(() => { /* phần thêm: lỗi thì vẫn xem được số liệu */ });
        loadUnlocks(true).then(() => { if (!huy) setMoKhoa((t) => t + 1); });
        return () => { huy = true; };
    }, [active, isLoggedIn]);

    const moCheDo = (key) => {
        const dich = MAN_CUA[key];
        if (!dich || (dich.feature && lockInfo(dich.feature).locked)) return;
        showScreen(dich.screen);
    };

    // AI tổng kết CHỈ khi bấm — mỗi tuần một lần, server lưu lại.
    const nhoTongKet = async () => {
        if (dangTongKet) return;
        setDangTongKet(true);
        try {
            const d = await TienBoAPI.taoTongKet();
            setTongKet(d?.tongKet || null);
        } catch (e) {
            Notification.error(String(e?.message || 'AI chưa tổng kết được, thử lại sau.'));
        } finally {
            setDangTongKet(false);
        }
    };

    const moBuoc = (buoc) => {
        const dich = MAN_BUOC[buoc];
        if (!dich || (dich.feature && lockInfo(dich.feature).locked)) return;
        if (dich.mode) EventBus.emit(GameEvents.PRACTICE_REQUESTED, { mode: dich.mode });
        else showScreen(dich.screen);
    };

    const tv = data?.tuVung;

    return (
        <div id="tien-bo-screen" className={`screen ${active ? 'active' : ''}`}>
            <div className="screen-header">
                <button className="back-btn-screen icon-btn" onClick={() => showScreen('home-screen')}>
                    <i className="fas fa-arrow-left"></i>
                </button>
                <h2><i className="fas fa-chart-line"></i> Tiến bộ của tôi</h2>
            </div>

            <div className="tb-wrap">
                {!isLoggedIn ? (
                    <p className="tr-intro-note">Đăng nhập để theo dõi tiến bộ qua các tuần.</p>
                ) : (
                    <>
                        <div className="cb-tab tb-tab" role="tablist">
                            <button type="button" role="tab" aria-selected={tab === 'tong-quan'} className={tab === 'tong-quan' ? 'is-on' : ''} onClick={() => setTab('tong-quan')}>
                                <i className="fas fa-chart-line"></i> Tổng quan
                            </button>
                            <button type="button" role="tab" aria-selected={tab === 'so-tay'} className={tab === 'so-tay' ? 'is-on' : ''} onClick={() => setTab('so-tay')}>
                                <i className="fas fa-book-bookmark"></i> Sổ tay lỗi
                            </button>
                        </div>
                        {/* Tải khi MỞ tab (và mỗi lần mở lại màn): làm bài xong quay lại là thấy lỗi mới. */}
                        {tab === 'so-tay' && <SoTayLoi active={active} />}
                        {tab === 'tong-quan' && (<>
                        <p className="tb-gioi-thieu">
                            8 tuần gần nhất, tính từ <strong>chính bài bạn đã làm</strong> ở mọi chế độ.
                            Xu hướng so 4 tuần gần đây với 4 tuần trước, và chỉ hiện khi mỗi bên có ít nhất 2 lượt.
                        </p>
                        {loi && <p className="tr-intro-note">{loi}</p>}
                        {!data && !loi && <p className="tr-intro-note"><i className="fas fa-spinner fa-spin"></i> Đang tải…</p>}
                        {data && !data.coDuLieu && (
                            <p className="tr-intro-note">
                                Chưa có bài nào trong 8 tuần qua. Làm vài lượt ở <strong>Lộ trình hôm nay</strong> rồi quay lại đây.
                            </p>
                        )}
                        {data && data.coDuLieu && (
                            <>
                                <div className="tb-tong-ket">
                                    <div className="tb-tong-ket-dau">
                                        <span><i className="fas fa-chalkboard-user"></i> Tổng kết tuần này</span>
                                        {tongKet && <small>AI viết từ số liệu bên dưới</small>}
                                    </div>
                                    {tongKet ? (
                                        <>
                                            {tongKet.tomTat && <p className="tb-tong-ket-tom-tat">{tongKet.tomTat}</p>}
                                            {tongKet.keHoach?.length > 0 && (
                                                <>
                                                    <div className="tb-tong-ket-muc">Kế hoạch tuần này</div>
                                                    <ol className="tb-ke-hoach">
                                                        {tongKet.keHoach.map((k) => {
                                                            const dich = MAN_BUOC[k.buoc];
                                                            const khoa = dich?.feature ? lockInfo(dich.feature) : { locked: false };
                                                            return (
                                                                <li key={k.viec}>
                                                                    <span>{k.viec}</span>
                                                                    {dich && !khoa.locked && (
                                                                        <button type="button" className="btn btn-secondary tb-ke-hoach-nut" onClick={() => moBuoc(k.buoc)}>
                                                                            Làm
                                                                        </button>
                                                                    )}
                                                                </li>
                                                            );
                                                        })}
                                                    </ol>
                                                </>
                                            )}
                                        </>
                                    ) : (
                                        <div className="tb-tong-ket-moi">
                                            <span>AI đọc số liệu 8 tuần của bạn, nhận xét và đề ra 2–3 việc cho tuần này. Mỗi tuần một lần.</span>
                                            <button type="button" className="btn btn-primary" onClick={nhoTongKet} disabled={dangTongKet}>
                                                {dangTongKet
                                                    ? <><i className="fas fa-spinner fa-spin"></i> Đang tổng kết…</>
                                                    : <><i className="fas fa-wand-magic-sparkles"></i> Nhờ AI tổng kết</>}
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {(data.nhanXet.tot.length > 0 || data.nhanXet.canLuyen.length > 0) && (
                                    <div className="tb-nhan-xet">
                                        {data.nhanXet.tot.length > 0 && (
                                            <div className="tb-nx is-tot">
                                                <div className="tb-nx-tieu-de"><i className="fas fa-seedling"></i> Đang tiến bộ</div>
                                                <ul>{data.nhanXet.tot.map((s) => <li key={s}>{s}</li>)}</ul>
                                            </div>
                                        )}
                                        {data.nhanXet.canLuyen.length > 0 && (
                                            <div className="tb-nx is-can">
                                                <div className="tb-nx-tieu-de"><i className="fas fa-bullseye"></i> Cần luyện</div>
                                                <ul>{data.nhanXet.canLuyen.map((s) => <li key={s}>{s}</li>)}</ul>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <h3 className="tb-muc">Kỹ năng</h3>
                                <div className="tb-luoi">
                                    {data.kyNang.map((k) => {
                                        const dich = MAN_CUA[k.key];
                                        const khoa = dich?.feature ? lockInfo(dich.feature) : { locked: false };
                                        return (
                                            <button
                                                key={k.key}
                                                type="button"
                                                className={`tb-the${k.soLuot ? '' : ' is-trong'}`}
                                                onClick={() => moCheDo(k.key)}
                                                disabled={khoa.locked}
                                                title={khoa.locked ? `Mở ở Level ${khoa.requiredLevel}` : `Luyện ${k.ten}`}
                                            >
                                                <div className="tb-the-dau">
                                                    <span className="tb-the-ten"><i className={`fas ${k.icon}`}></i> {k.ten}</span>
                                                    <NhanXuHuong xh={k.xuHuong} />
                                                </div>
                                                <div className="tb-the-diem">
                                                    {hienDiem(k.ganDay, k.donVi)}
                                                    {k.donVi === '/9' && k.ganDay !== null && <small>/9</small>}
                                                    {k.truoc !== null && k.ganDay !== null && (
                                                        <span className="tb-the-truoc">trước: {hienDiem(k.truoc, k.donVi)}</span>
                                                    )}
                                                </div>
                                                <CotTuan diem={k.diem} tuan={data.tuan} donVi={k.donVi} />
                                                <div className="tb-the-chan">
                                                    {k.soLuot ? `${k.soLuot} lượt · ${k.nguon}` : `Chưa làm · ${k.nguon}`}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                <h3 className="tb-muc">Lỗi ngữ pháp hay mắc <small>(Viết và Dịch)</small></h3>
                                {data.nguPhap.length === 0 ? (
                                    <p className="tr-intro-note">Chưa có nhóm lỗi nào lặp lại từ 3 lần trở lên.</p>
                                ) : (
                                    <ul className="tb-loi-ds">
                                        {data.nguPhap.map((g) => (
                                            <li key={g.key} className="tb-loi">
                                                <div className="tb-loi-dau">
                                                    <strong>{g.vi}</strong>
                                                    <span className="tb-loi-dem">{g.count} lần</span>
                                                    <NhanXuHuong xh={g.xuHuong} bang={XU_HUONG_LOI} />
                                                </div>
                                                {g.truoc !== null && g.ganDay !== null && (
                                                    <div className="tb-loi-ti-le">{g.truoc} → {g.ganDay} lỗi/bài</div>
                                                )}
                                                {g.hint && <div className="tb-loi-goi-y"><i className="fas fa-lightbulb"></i> {g.hint}</div>}
                                            </li>
                                        ))}
                                    </ul>
                                )}

                                {data.tieuChiNoi.length > 0 && (
                                    <>
                                        <h3 className="tb-muc">Tiêu chí Nói <small>(điểm 0–9)</small></h3>
                                        <ul className="tb-tieu-chi">
                                            {data.tieuChiNoi.map((c) => (
                                                <li key={c.label}>
                                                    <span>{c.label}</span>
                                                    <span className="tb-tieu-chi-so">
                                                        {c.truoc !== null && <>{c.truoc} → </>}
                                                        <strong>{c.ganDay ?? '—'}</strong>
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </>
                                )}

                                <h3 className="tb-muc">Từ sai</h3>
                                <div className="tb-tu-vung">
                                    <div><strong>{tv.dangOn}</strong><span>đang ôn</span></div>
                                    <div className={tv.denHan ? 'is-can' : ''}><strong>{tv.denHan}</strong><span>đến hạn</span></div>
                                    <div><strong>{tv.daThuoc}</strong><span>đã thuộc</span></div>
                                    <div className={tv.moiThuoc ? 'is-tot' : ''}><strong>+{tv.moiThuoc}</strong><span>thuộc trong 7 ngày</span></div>
                                </div>
                            </>
                        )}
                        </>)}
                    </>
                )}
            </div>
        </div>
    );
}
