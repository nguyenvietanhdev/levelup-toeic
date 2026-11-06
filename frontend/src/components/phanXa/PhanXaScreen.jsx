import { useCallback, useEffect, useRef, useState } from 'react';
import { useGame } from '@game/GameContext.jsx';
import { GameLogic } from '@game/gameLogic.js';
import { useAuth } from '@components/auth/AuthContext.jsx';
import { Notification } from '@ui/Toaster.jsx';
import { PhanXaAPI } from '@api/phanXa.js';
import { isSpeechSupported, speechLangFor } from '@lib/speechInput.js';
import { moNguPhap, NGU_PHAP_THEO_KHUNG } from '@lib/nguPhapLienKet.js';
import { useGhiAm } from '../conversation/useGhiAm.js';
import { useHoiKhiThoat } from '../ai/aiExitGuard.js';

/** Thanh giờ chỉ để giục, hết giờ KHÔNG tính sai: bắt lỗi phản xạ chứ không phạt người chậm. */
const GIAY_GOI_Y = 10;
/** Giữ micro lâu hơn mức này = nhấn-giữ (nhả là chấm); ngắn hơn = chạm để bật, chạm lần nữa để dừng. */
const GIU_MS = 350;

const dungPhat = () => {
    try { GameLogic.stopSpeaking?.(); } catch { /* chưa phát gì */ }
};
const phat = (text) => {
    if (!text) return;
    dungPhat();
    // Kho câu chỉ có tiếng Anh nên luôn đọc giọng Anh, không theo ngôn ngữ từ vựng đang chọn.
    try { GameLogic.speakWord(text, 'en-US'); } catch { /* không đọc được thì thôi */ }
};

/** Thẻ quy tắc của một khung: vài ý ngắn và ví dụ sai → đúng. */
function TheQuyTac({ the }) {
    if (!the) return null;
    return (
        <div className="px-quy-tac">
            <strong>{the.ten}</strong>
            <ul>{the.y?.map((y) => <li key={y}>{y}</li>)}</ul>
            <div className="px-quy-tac-vd">
                {the.vd?.map((v) => (
                    <p key={v.dung}>
                        <span className="is-sai"><i className="fas fa-xmark"></i> {v.sai}</span>
                        <span className="is-dung"><i className="fas fa-check"></i> {v.dung}</span>
                    </p>
                ))}
            </div>
        </div>
    );
}

/**
 * Phản xạ câu — lượt ngắn: nhìn câu tiếng Việt, nói (hoặc gõ) câu tiếng Anh, thấy ngay
 * câu đúng và nghe lại. Không tốn năng lượng, không XP: đây là bài tập lặp lại, mở lúc
 * nào cũng được. Đáp án chỉ về client SAU khi đã chấm từng câu.
 */
export default function PhanXaScreen({ active }) {
    const { showScreen } = useGame();
    const { isLoggedIn } = useAuth();
    const coMic = isSpeechSupported();
    const ghi = useGhiAm(speechLangFor('en'));

    const [tongQuan, setTongQuan] = useState(null);
    const [pha, setPha] = useState('tong'); // tong → hoi ⇄ ketqua → xong
    const [buoi, setBuoi] = useState(null);
    const [i, setI] = useState(0);
    const [nhap, setNhap] = useState('');
    const [giay, setGiay] = useState(0);
    const [ketQua, setKetQua] = useState(null);
    const [dangCham, setDangCham] = useState(false);
    const [dangMo, setDangMo] = useState(false);
    const [baoMic, setBaoMic] = useState('');
    const [lichSu, setLichSu] = useState([]);
    const [xemQuyTac, setXemQuyTac] = useState(false);

    const oNhap = useRef(null);
    const vuaGo = useRef(false); // câu trước gõ → câu sau đặt sẵn con trỏ vào ô nhập
    const muonDung = useRef(false); // nhả phím khi micro còn đang mở (chờ xin quyền)
    const daDung = useRef(false); // đã bấm dừng: chặn bấm lặp làm chấm hai lần
    const mocGiu = useRef(0);

    const cau = buoi?.cau?.[i];
    const dangLam = pha === 'hoi' || pha === 'ketqua';
    const dangGhi = ghi.trangThai === 'ghi';

    useHoiKhiThoat('phan-xa-screen', dangLam, {
        tieuDe: 'Thoát lượt luyện?',
        noiDung: 'Các câu đã trả lời vẫn được lưu; những câu còn lại sẽ không được tính. Bạn có chắc chắn muốn thoát?',
    });

    // Rời màn: dừng tiếng và micro, về tổng quan. Vào màn: tải lại số liệu mới nhất.
    useEffect(() => {
        if (active) return undefined;
        dungPhat();
        ghi.lamLai();
        setPha('tong');
        setBuoi(null);
        return undefined;
    }, [active, ghi.lamLai]); // eslint-disable-line react-hooks/exhaustive-deps

    const taiTongQuan = useCallback(() => {
        PhanXaAPI.tongQuan().then(setTongQuan).catch((e) => Notification.error(e.message));
    }, []);

    useEffect(() => {
        if (active && isLoggedIn && pha === 'tong') taiTongQuan();
    }, [active, isLoggedIn, pha, taiTongQuan]);

    const moLuot = useCallback(async ({ khung = '', som = false } = {}) => {
        if (dangMo) return;
        setDangMo(true);
        try {
            const b = await PhanXaAPI.taoBuoi({ khung, som });
            if (!b?.cau?.length) {
                Notification.info('Chưa có câu nào cần luyện lúc này.');
                return;
            }
            setBuoi(b);
            setI(0);
            setNhap('');
            setGiay(0);
            setKetQua(null);
            setBaoMic('');
            setLichSu([]);
            vuaGo.current = false;
            setXemQuyTac(false);
            // Khung đang yếu về quy tắc thì đọc thẻ trước, nếu không người học chỉ đoán.
            setPha(b.canXem?.length ? 'quyTac' : 'hoi');
        } catch (e) {
            Notification.error(e.message);
        } finally {
            setDangMo(false);
        }
    }, [dangMo]);

    // Đi từ bước Phản xạ của Lộ trình: mở thẳng lượt luyện đúng khung trọng tâm.
    useEffect(() => {
        if (!active || !isLoggedIn || pha !== 'tong') return;
        let khung = '';
        try {
            khung = sessionStorage.getItem('levelup.phanXa.khung') || '';
            sessionStorage.removeItem('levelup.phanXa.khung');
        } catch { /* không đọc được thì hiện tổng quan */ }
        if (khung) moLuot({ khung, som: true });
    }, [active, isLoggedIn, pha, moLuot]);

    const gui = useCallback(async (chu, cach = '') => {
        if (dangCham || !buoi || !cau) return;
        setDangCham(true);
        setBaoMic('');
        let kq;
        try {
            kq = await PhanXaAPI.traLoi(buoi.id, i, chu, cach);
        } catch (e) {
            // Server có thể đã giữ chỗ câu này nên không gửi lại được: báo rồi cho sang câu tiếp.
            kq = { dung: false, khongChac: true, cauDung: '', ghiChu: e.message };
        }
        setDangCham(false);
        setKetQua({ ...kq, cuaBan: chu });
        setLichSu((d) => [...d, { vi: cau.vi, cauDung: kq.cauDung, dung: kq.dung, khongChac: kq.khongChac }]);
        setPha('ketqua');
        phat(kq.cauDung);
    }, [dangCham, buoi, cau, i]);

    const sangCau = useCallback(() => {
        dungPhat();
        ghi.lamLai();
        setKetQua(null);
        setNhap('');
        setGiay(0);
        setBaoMic('');
        setXemQuyTac(false);
        if (i + 1 >= (buoi?.cau?.length || 0)) {
            setPha('xong');
            return;
        }
        setI(i + 1);
        setPha('hoi');
    }, [i, buoi, ghi.lamLai]); // eslint-disable-line react-hooks/exhaustive-deps

    // Câu trước gõ thì câu sau đặt sẵn con trỏ. KHÔNG tự focus khi đang dùng giọng nói:
    // ô nhập đang focus thì phím Cách gõ dấu cách chứ không bật micro.
    useEffect(() => {
        if (pha === 'hoi' && vuaGo.current) oNhap.current?.focus();
    }, [pha, i]);

    useEffect(() => {
        if (!active || pha !== 'hoi') return undefined;
        const t = setInterval(() => setGiay((s) => s + 1), 1000);
        return () => clearInterval(t);
    }, [active, pha, i]);

    const batDauNoi = useCallback(() => {
        if (!coMic || pha !== 'hoi' || dangCham || ghi.trangThai !== 'nghi') return;
        dungPhat();
        setBaoMic('');
        muonDung.current = false;
        daDung.current = false;
        vuaGo.current = false;
        ghi.batDau();
    }, [coMic, pha, dangCham, ghi.trangThai, ghi.batDau]); // eslint-disable-line react-hooks/exhaustive-deps

    const dungNoi = useCallback(() => {
        if (daDung.current) return;
        if (ghi.trangThai === 'ghi') {
            daDung.current = true;
            ghi.dung();
        } else {
            muonDung.current = true;
        }
    }, [ghi.trangThai, ghi.dung]); // eslint-disable-line react-hooks/exhaustive-deps

    // Nhả phím trong lúc micro chưa mở xong (đang xin quyền): mở xong thì dừng luôn.
    useEffect(() => {
        if (dangGhi && muonDung.current) {
            muonDung.current = false;
            daDung.current = true;
            ghi.dung();
        }
    }, [dangGhi, ghi.dung]); // eslint-disable-line react-hooks/exhaustive-deps

    // Micro dừng hẳn (đã chờ nốt phần chữ cuối) → chấm luôn.
    useEffect(() => {
        if (ghi.trangThai !== 'xong') return;
        const chu = (ghi.chu || '').trim();
        const conLoi = !!ghi.loi;
        ghi.xongGui();
        if (pha !== 'hoi' || dangCham) return;
        if (chu) gui(chu, 'noi');
        else if (!conLoi) setBaoMic('Chưa nghe rõ — thử nói lại, hoặc gõ câu trả lời.');
    }, [ghi.trangThai]); // eslint-disable-line react-hooks/exhaustive-deps

    // Giữ phím Cách để nói; Enter ở màn kết quả để sang câu tiếp.
    useEffect(() => {
        if (!active || !dangLam) return undefined;
        const laONhap = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
        const coPopup = () => !!document.querySelector('#modal-container.active');

        const xuong = (e) => {
            if (e.repeat || coPopup() || laONhap(e.target)) return;
            if (e.code === 'Space' && pha === 'hoi') {
                e.preventDefault();
                batDauNoi();
            } else if (e.key === 'Enter' && pha === 'ketqua' && e.target?.tagName !== 'BUTTON') {
                e.preventDefault();
                sangCau();
            }
        };
        const len = (e) => {
            if (e.code !== 'Space' || laONhap(e.target)) return;
            if (pha === 'hoi') {
                e.preventDefault();
                dungNoi();
            }
        };
        // Chuyển cửa sổ khi đang giữ phím thì không có keyup: không để micro mở mãi.
        const roi = () => { if (dangGhi) dungNoi(); };

        window.addEventListener('keydown', xuong);
        window.addEventListener('keyup', len);
        window.addEventListener('blur', roi);
        return () => {
            window.removeEventListener('keydown', xuong);
            window.removeEventListener('keyup', len);
            window.removeEventListener('blur', roi);
        };
    }, [active, dangLam, pha, dangGhi, batDauNoi, dungNoi, sangCau]);

    const nhanMic = (e) => {
        e.preventDefault();
        try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* không bắt được thì thôi */ }
        if (dangGhi) {
            mocGiu.current = 0;
            dungNoi();
        } else {
            mocGiu.current = Date.now();
            batDauNoi();
        }
    };
    const nhaMic = () => {
        if (mocGiu.current && Date.now() - mocGiu.current >= GIU_MS) dungNoi();
        mocGiu.current = 0;
    };

    const guiGo = (e) => {
        e.preventDefault();
        const chu = nhap.trim();
        if (!chu) return;
        vuaGo.current = true;
        gui(chu, 'go');
    };

    const soDung = lichSu.filter((c) => c.dung).length;
    const canOn = lichSu.filter((c) => !c.dung && !c.khongChac);
    const conPhan = Math.max(0, 100 - (giay / GIAY_GOI_Y) * 100);

    return (
        <div id="phan-xa-screen" className={`screen ${active ? 'active' : ''}`}>
            <div className="screen-header">
                <button className="back-btn-screen icon-btn" onClick={() => showScreen('home-screen')}>
                    <i className="fas fa-arrow-left"></i>
                </button>
                <h2><i className="fas fa-bolt"></i> Phản xạ câu</h2>
            </div>

            <div className="px-wrap">
                {!isLoggedIn && <p className="px-mo-ta">Đăng nhập để luyện và lưu tiến độ.</p>}

                {isLoggedIn && pha === 'tong' && tongQuan?.hoTro === false && (
                    <p className="px-mo-ta">Chế độ này hiện chỉ có câu tiếng Anh. Đổi ngôn ngữ học sang tiếng Anh để luyện.</p>
                )}

                {isLoggedIn && pha === 'tong' && tongQuan?.hoTro && (
                    <>
                        <p className="px-mo-ta">Nhìn câu tiếng Việt và nói ngay câu tiếng Anh. Mỗi lượt khoảng 3 phút, câu sai sẽ quay lại vào hôm sau.</p>
                        <div className="px-so">
                            <div><strong>{tongQuan.denHan}</strong><span>Đến hạn ôn</span></div>
                            <div><strong>{tongQuan.moi}</strong><span>Câu mới</span></div>
                            <div><strong>{tongQuan.daThuoc}/{tongQuan.tong}</strong><span>Đã thuộc</span></div>
                        </div>
                        <div className="px-nut">
                            {tongQuan.denHan + tongQuan.moi > 0 ? (
                                <button type="button" className="btn btn-primary" disabled={dangMo} onClick={() => moLuot()}>
                                    <i className="fas fa-bolt"></i> Luyện {Math.min(12, tongQuan.denHan + tongQuan.moi)} câu
                                </button>
                            ) : (
                                <button type="button" className="btn btn-secondary" disabled={dangMo} onClick={() => moLuot({ som: true })}>
                                    Đã ôn xong — ôn sớm vẫn được
                                </button>
                            )}
                        </div>
                        <div className="px-khung">
                            {tongQuan.khung.map((k) => (
                                <button
                                    key={k.key}
                                    type="button"
                                    className="px-the"
                                    disabled={dangMo}
                                    onClick={() => moLuot({ khung: k.key, som: k.denHan + k.moi === 0 })}
                                >
                                    <i className={`fas ${k.icon}`}></i>
                                    <span className="px-the-than">
                                        <strong>{k.ten}</strong>
                                        <small>{k.moTa}</small>
                                    </span>
                                    <span className="px-the-so">{k.daThuoc}/{k.tong}</span>
                                </button>
                            ))}
                        </div>
                    </>
                )}

                {pha === 'quyTac' && (
                    <>
                        <p className="px-mo-ta">Đọc nhanh quy tắc trước khi luyện. Bạn có thể xem lại sau mỗi câu sai.</p>
                        {buoi?.canXem?.map((k) => <TheQuyTac key={k} the={buoi.quyTac?.[k]} />)}
                        <div className="px-nut">
                            <button type="button" className="btn btn-primary" autoFocus onClick={() => setPha('hoi')}>
                                <i className="fas fa-bolt"></i> Bắt đầu luyện
                            </button>
                        </div>
                    </>
                )}

                {dangLam && cau && (
                    <>
                        <div className="px-dau">
                            <span>Câu {i + 1}/{buoi.cau.length} · {cau.tenKhung}</span>
                        </div>
                        {pha === 'hoi' && (
                            <div className={`px-gio ${conPhan === 0 ? 'is-het' : ''}`} aria-hidden="true">
                                <span style={{ width: `${conPhan}%` }}></span>
                            </div>
                        )}
                        <p className="px-vi">{cau.vi}</p>

                        {pha === 'hoi' && (
                            <>
                                <form className="px-nhap" onSubmit={guiGo}>
                                    {coMic && (
                                        <button
                                            type="button"
                                            className={`px-mic ${dangGhi ? 'is-ghi' : ''}`}
                                            disabled={dangCham}
                                            aria-label={dangGhi ? 'Dừng nói' : 'Nói câu trả lời'}
                                            title="Nhấn giữ để nói, nhả ra là chấm"
                                            onPointerDown={nhanMic}
                                            onPointerUp={nhaMic}
                                            onPointerCancel={nhaMic}
                                        >
                                            <i className={`fas ${dangGhi ? 'fa-stop' : 'fa-microphone'}`}></i>
                                        </button>
                                    )}
                                    <input
                                        ref={oNhap}
                                        value={dangGhi ? ghi.chu : nhap}
                                        readOnly={dangGhi}
                                        disabled={dangCham}
                                        maxLength={200}
                                        autoComplete="off"
                                        placeholder={dangGhi ? 'Đang nghe…' : 'Hoặc gõ tại đây…'}
                                        onChange={(e) => setNhap(e.target.value)}
                                    />
                                    <button type="submit" className="btn btn-primary" disabled={dangCham || dangGhi || !nhap.trim()}>
                                        {dangCham ? '…' : 'Kiểm tra'}
                                    </button>
                                </form>
                                {(ghi.loi || baoMic) && <p className="px-goi-y">{ghi.loi || baoMic}</p>}
                                <p className="px-goi-y">
                                    {coMic
                                        ? 'Giữ phím Cách hoặc nhấn giữ micro để nói, nhả ra là chấm.'
                                        : 'Trình duyệt này chưa nhận được giọng nói nên bạn gõ câu trả lời. Muốn luyện nói, hãy mở bằng Chrome hoặc Edge.'}
                                </p>
                                <div className="px-nut">
                                    <button type="button" className="btn btn-secondary" disabled={dangCham || dangGhi} onClick={() => gui('')}>
                                        Chưa biết — xem câu đúng
                                    </button>
                                </div>
                            </>
                        )}

                        {pha === 'ketqua' && ketQua && (
                            <>
                                <div className={`px-ket-qua ${ketQua.khongChac ? '' : ketQua.dung ? 'is-dung' : 'is-sai'}`} role="status">
                                    <div className="px-ket-qua-dau">
                                        {ketQua.khongChac ? 'Chưa chấm được — câu này không tính'
                                            : ketQua.dung ? <><i className="fas fa-check"></i> Đúng rồi</>
                                                : ketQua.boQua ? 'Câu đúng là' : <><i className="fas fa-xmark"></i> Chưa đúng</>}
                                    </div>
                                    {ketQua.cauDung && <p className="px-cau-dung">{ketQua.cauDung}</p>}
                                    {ketQua.cuaBan && <p className="px-cua-ban">Bạn: {ketQua.cuaBan}</p>}
                                    {ketQua.ghiChu && <p className="px-ghi-chu">{ketQua.ghiChu}</p>}
                                </div>
                                <p className="px-goi-y">Nói lại câu đúng một lần trước khi sang câu tiếp.</p>
                                <div className="px-nut">
                                    {ketQua.cauDung && (
                                        <button type="button" className="btn btn-secondary" onClick={() => phat(ketQua.cauDung)}>
                                            <i className="fas fa-volume-high"></i> Nghe lại
                                        </button>
                                    )}
                                    {!ketQua.dung && buoi.quyTac?.[cau.khung] && (
                                        <button type="button" className="btn btn-secondary" onClick={() => setXemQuyTac((x) => !x)}>
                                            <i className="fas fa-book-open"></i> {xemQuyTac ? 'Ẩn quy tắc' : 'Xem quy tắc'}
                                        </button>
                                    )}
                                    {!ketQua.dung && NGU_PHAP_THEO_KHUNG[cau.khung] && (
                                        <button type="button" className="btn btn-secondary" onClick={() => moNguPhap(NGU_PHAP_THEO_KHUNG[cau.khung])}>
                                            <i className="fas fa-spell-check"></i> Xem công thức
                                        </button>
                                    )}
                                    <button type="button" className="btn btn-primary" onClick={sangCau}>
                                        {i + 1 >= buoi.cau.length ? 'Xem kết quả' : 'Câu tiếp'}
                                    </button>
                                </div>
                                {xemQuyTac && <TheQuyTac the={buoi.quyTac?.[cau.khung]} />}
                            </>
                        )}
                    </>
                )}

                {pha === 'xong' && (
                    <>
                        <div className="px-so">
                            <div><strong>{soDung}/{lichSu.length}</strong><span>Câu đúng</span></div>
                            <div><strong>{canOn.length}</strong><span>Ôn lại ngày mai</span></div>
                            <div><strong>{lichSu.length - soDung - canOn.length}</strong><span>Không tính</span></div>
                        </div>
                        {canOn.length > 0 && (
                            <ul className="px-sai-ds">
                                {canOn.map((c) => (
                                    <li key={c.vi}>
                                        {c.cauDung}
                                        <small>{c.vi}</small>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <div className="px-nut">
                            <button type="button" className="btn btn-primary" onClick={() => setPha('tong')}>Xong</button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
