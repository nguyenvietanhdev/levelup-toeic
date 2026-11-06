import { useCallback, useEffect, useRef, useState } from 'react';
import { useGame } from '@game/GameContext.jsx';
import { GameLogic } from '@game/gameLogic.js';
import { useAuth } from '@components/auth/AuthContext.jsx';
import { Notification } from '@ui/Toaster.jsx';
import { HoSoHocAPI } from '@api/hoSoHoc.js';
import { isSpeechSupported, speechLangFor } from '@lib/speechInput.js';
import { useGhiAm } from '../conversation/useGhiAm.js';
import { useHoiKhiThoat } from '../ai/aiExitGuard.js';

/** Chỉ mục tiêu đã có đủ nội dung mới chọn được, để không hứa lộ trình chưa tồn tại. */
const MUC_TIEU = [
    { key: 'giao-tiep', ten: 'Giao tiếp', icon: 'fa-comments', moTa: 'Nói được câu tự nhiên trong đời sống hằng ngày.' },
    { key: 'toeic', ten: 'TOEIC', icon: 'fa-file-lines', moTa: 'Sắp có', khoa: true },
    { key: 'ielts', ten: 'IELTS', icon: 'fa-graduation-cap', moTa: 'Sắp có', khoa: true },
    { key: 'hsk', ten: 'HSK', icon: 'fa-language', moTa: 'Sắp có', khoa: true },
];

const NHAN_MUC = { yeu: 'Cần luyện', 'dang-len': 'Đang lên', vung: 'Vững', 'chua-du': 'Chưa đủ dữ liệu' };

const dungPhat = () => {
    try { GameLogic.stopSpeaking?.(); } catch { /* chưa phát gì */ }
};
const phat = (text) => {
    if (!text) return;
    dungPhat();
    try { GameLogic.speakWord(text, 'en-US'); } catch { /* không đọc được thì thôi */ }
};

/**
 * Mục tiêu & trình độ: chọn mục tiêu → test đầu vào (chọn, gõ, nói, nghe) → chẩn đoán.
 * Đáp án chỉ về client khi đã nộp xong cả bài, và trong lúc test không báo đúng/sai để
 * câu trước không ảnh hưởng tâm lý câu sau.
 */
export default function HoSoHocScreen({ active }) {
    const { showScreen } = useGame();
    const { isLoggedIn } = useAuth();
    const coMic = isSpeechSupported();
    const ghi = useGhiAm(speechLangFor('en'));

    const [hoSo, setHoSo] = useState(null);
    const [pha, setPha] = useState('hoSo'); // hoSo | test
    const [buoiId, setBuoiId] = useState('');
    const [cau, setCau] = useState(null);
    const [nhap, setNhap] = useState('');
    const [goThay, setGoThay] = useState(false);
    const [dang, setDang] = useState(false);
    const [baoMic, setBaoMic] = useState('');
    const [loiTest, setLoiTest] = useState('');
    const [canXem, setCanXem] = useState(null);
    const oNhap = useRef(null);

    const dangGhi = ghi.trangThai === 'ghi';

    useHoiKhiThoat('ho-so-hoc-screen', pha === 'test', {
        tieuDe: 'Thoát bài test?',
        noiDung: 'Bài test chưa xong sẽ không được lưu và phải làm lại từ đầu. Bạn có chắc chắn muốn thoát?',
    });

    useEffect(() => {
        if (active) return undefined;
        dungPhat();
        ghi.lamLai();
        setPha('hoSo');
        setCau(null);
        setCanXem(null);
        return undefined;
    }, [active, ghi.lamLai]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!active || !isLoggedIn || pha !== 'hoSo') return undefined;
        let huy = false;
        HoSoHocAPI.get()
            .then((d) => { if (!huy) setHoSo(d); })
            .catch((e) => { if (!huy) Notification.error(e.message); });
        return () => { huy = true; };
    }, [active, isLoggedIn, pha]);

    // Câu mới: xoá trạng thái câu trước; câu nghe tự phát; câu gõ đặt sẵn con trỏ.
    useEffect(() => {
        if (!cau) return;
        setNhap('');
        setGoThay(false);
        setBaoMic('');
        ghi.lamLai();
        if (cau.loai === 'nghe') phat(cau.doc);
        if (cau.loai === 'go') oNhap.current?.focus();
    }, [cau]); // eslint-disable-line react-hooks/exhaustive-deps

    const moTest = async () => {
        if (dang) return;
        setDang(true);
        setLoiTest('');
        try {
            await HoSoHocAPI.datMucTieu('giao-tiep');
            const r = await HoSoHocAPI.moTest(coMic);
            setBuoiId(r.id);
            setCau(r.cau);
            setCanXem(null);
            setPha('test');
        } catch (e) {
            Notification.error(e.message);
        } finally {
            setDang(false);
        }
    };

    const nop = useCallback(async (body) => {
        if (dang || !cau) return;
        setDang(true);
        dungPhat();
        try {
            const r = await HoSoHocAPI.traLoi(buoiId, { i: cau.i, ...body });
            if (r.xong) {
                setHoSo(r.hoSo);
                setCanXem(r.canXem || []);
                setCau(null);
                setPha('hoSo');
            } else {
                setCau(r.cau);
            }
        } catch (e) {
            // Server có thể đã giữ chỗ câu này nên không gửi lại được: báo và cho mở lại bài.
            setLoiTest(e.message);
        } finally {
            setDang(false);
        }
    }, [dang, cau, buoiId]);

    // Micro dừng hẳn (đã chờ nốt phần chữ cuối) → nộp luôn câu vừa nói.
    useEffect(() => {
        if (ghi.trangThai !== 'xong') return;
        const chu = (ghi.chu || '').trim();
        const conLoi = !!ghi.loi;
        ghi.xongGui();
        if (pha !== 'test' || dang) return;
        if (chu) nop({ traLoi: chu, cach: 'noi' });
        else if (!conLoi) setBaoMic('Chưa nghe rõ — thử nói lại, hoặc chuyển sang gõ.');
    }, [ghi.trangThai]); // eslint-disable-line react-hooks/exhaustive-deps

    const bamMic = () => {
        if (dangGhi) { ghi.dung(); return; }
        if (ghi.trangThai === 'nghi') {
            setBaoMic('');
            ghi.batDau();
        }
    };

    const guiGo = (e) => {
        e.preventDefault();
        const chu = nhap.trim();
        if (chu) nop({ traLoi: chu, cach: 'go' });
    };

    /** Mở thẳng Phản xạ câu ở khung này; thẻ quy tắc tự hiện nếu cần. */
    const luyenKhung = (khung) => {
        try { sessionStorage.setItem('levelup.phanXa.khung', khung); } catch { /* mở tổng quan */ }
        showScreen('phan-xa-screen');
    };

    const canNoi = cau?.loai === 'noi' && !goThay;
    const canGo = cau?.loai === 'go' || (cau?.loai === 'noi' && goThay);
    const lanTruoc = hoSo?.lichSuTest?.length > 1 ? hoSo.lichSuTest[hoSo.lichSuTest.length - 2] : null;

    return (
        <div id="ho-so-hoc-screen" className={`screen ${active ? 'active' : ''}`}>
            <div className="screen-header">
                <button className="back-btn-screen icon-btn" onClick={() => showScreen('home-screen')}>
                    <i className="fas fa-arrow-left"></i>
                </button>
                <h2><i className="fas fa-bullseye"></i> Mục tiêu &amp; trình độ</h2>
            </div>

            <div className="px-wrap">
                {!isLoggedIn && <p className="px-mo-ta">Đăng nhập để lập hồ sơ và lộ trình riêng.</p>}

                {isLoggedIn && pha === 'hoSo' && hoSo && !hoSo.testNgay && (
                    <>
                        <p className="px-mo-ta">Chọn mục tiêu rồi làm bài test khoảng 8 phút. Hệ thống sẽ tìm ra chỗ bạn đang vướng và sắp lộ trình theo đó.</p>
                        <div className="hs-muc-tieu">
                            {MUC_TIEU.map((m) => (
                                <div key={m.key} className={`hs-muc ${m.khoa ? 'is-khoa' : 'is-chon'}`}>
                                    <i className={`fas ${m.icon}`}></i>
                                    <strong>{m.ten}</strong>
                                    <small>{m.moTa}</small>
                                </div>
                            ))}
                        </div>
                        <p className="px-goi-y">
                            {coMic
                                ? 'Bài test có phần nói, hãy chuẩn bị micro. Không tiện nói thì chuyển sang gõ ở từng câu.'
                                : 'Trình duyệt này chưa nhận được giọng nói nên phần nói sẽ đổi thành gõ, và kỹ năng Nói chưa được đánh giá. Muốn đánh giá cả phần nói, hãy mở bằng Chrome hoặc Edge.'}
                        </p>
                        <div className="px-nut">
                            <button type="button" className="btn btn-primary" disabled={dang} onClick={moTest}>
                                <i className="fas fa-play"></i> Bắt đầu test
                            </button>
                        </div>
                    </>
                )}

                {isLoggedIn && pha === 'hoSo' && hoSo?.testNgay && (
                    <>
                        <div className="px-so">
                            <div><strong>{hoSo.trinhDo.nhan}</strong><span>Trình độ ước lượng</span></div>
                            <div><strong>{hoSo.trinhDo.diem}/100</strong><span>Điểm chung</span></div>
                            <div>
                                <strong>{lanTruoc ? `${hoSo.trinhDo.diem - lanTruoc.diem >= 0 ? '+' : ''}${hoSo.trinhDo.diem - lanTruoc.diem}` : '—'}</strong>
                                <span>So với lần test trước</span>
                            </div>
                        </div>

                        <h3 className="hs-tieu-de">Kỹ năng</h3>
                        <ul className="hs-ky-nang">
                            {hoSo.kyNang.map((k) => (
                                <li key={k.key}>
                                    <div className="hs-ky-nang-dau">
                                        <span><i className={`fas ${k.icon}`}></i> {k.ten}</span>
                                        <span className={`hs-nhan is-${k.muc}`}>{NHAN_MUC[k.muc]}</span>
                                    </div>
                                    {k.duDuLieu && <div className="hs-thanh"><span className={`is-${k.muc}`} style={{ width: `${k.diem}%` }}></span></div>}
                                </li>
                            ))}
                        </ul>

                        {hoSo.chanDoan?.length > 0 && (
                            <>
                                <h3 className="hs-tieu-de">Chẩn đoán</h3>
                                <ul className="px-sai-ds">
                                    {hoSo.chanDoan.map((c) => (
                                        <li key={c.kyNang}>
                                            <strong>{c.ten}:</strong> {c.nhan}
                                            <small>{c.viec}</small>
                                            {c.kyNang !== 'nghe' && (
                                                <button type="button" className="lt-ke-hoach-link" onClick={() => luyenKhung(c.kyNang)}>
                                                    Luyện khung này
                                                </button>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}

                        {canXem?.length > 0 && (
                            <>
                                <h3 className="hs-tieu-de">Câu cần xem lại</h3>
                                <ul className="px-sai-ds">
                                    {canXem.map((c) => (
                                        <li key={c.de}>
                                            {c.dapAn}
                                            <small>{c.de}</small>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}

                        <p className="px-goi-y">Đây là ước lượng ban đầu từ 15 câu và sẽ chính xác dần khi bạn luyện. Bộ nhận giọng nói đôi khi nghe nhầm nên phần nói có thể lệch một chút.</p>
                        <div className="px-nut">
                            <button type="button" className="btn btn-primary" onClick={() => showScreen('lo-trinh-screen')}>
                                <i className="fas fa-route"></i> Xem lộ trình hôm nay
                            </button>
                            <button type="button" className="btn btn-secondary" disabled={dang} onClick={moTest}>Làm lại test</button>
                        </div>
                    </>
                )}

                {pha === 'test' && cau && (
                    <>
                        <div className="px-dau"><span>Câu {cau.i + 1}/{cau.tong} · {cau.tenKyNang}</span></div>
                        <div className="px-gio" aria-hidden="true"><span style={{ width: `${(cau.i / cau.tong) * 100}%` }}></span></div>

                        {loiTest ? (
                            <>
                                <p className="px-mo-ta">{loiTest}</p>
                                <div className="px-nut">
                                    <button type="button" className="btn btn-primary" disabled={dang} onClick={moTest}>Làm lại từ đầu</button>
                                </div>
                            </>
                        ) : (
                            <>
                                {cau.loai === 'nghe' && (
                                    <div className="px-nut hs-nghe">
                                        <button type="button" className="btn btn-secondary" onClick={() => phat(cau.doc)}>
                                            <i className="fas fa-volume-high"></i> Nghe lại
                                        </button>
                                    </div>
                                )}
                                <p className="px-vi">{cau.vi || cau.hoi}</p>

                                {cau.lua && (
                                    <div className="hs-lua">
                                        {cau.lua.map((x) => (
                                            <button key={x} type="button" className="btn btn-secondary" disabled={dang} onClick={() => nop({ chon: x })}>{x}</button>
                                        ))}
                                    </div>
                                )}

                                {canNoi && (
                                    <div className="hs-noi">
                                        <button
                                            type="button"
                                            className={`px-mic ${dangGhi ? 'is-ghi' : ''}`}
                                            disabled={dang}
                                            aria-label={dangGhi ? 'Dừng nói' : 'Bắt đầu nói'}
                                            onClick={bamMic}
                                        >
                                            <i className={`fas ${dangGhi ? 'fa-stop' : 'fa-microphone'}`}></i>
                                        </button>
                                        <p className="px-goi-y">{dangGhi ? (ghi.chu || 'Đang nghe… chạm để dừng.') : 'Chạm micro, nói câu tiếng Anh, chạm lần nữa để nộp.'}</p>
                                        {(ghi.loi || baoMic) && <p className="px-goi-y">{ghi.loi || baoMic}</p>}
                                    </div>
                                )}

                                {canGo && (
                                    <form className="px-nhap" onSubmit={guiGo}>
                                        <input
                                            ref={oNhap}
                                            value={nhap}
                                            disabled={dang}
                                            maxLength={200}
                                            autoComplete="off"
                                            placeholder="Gõ câu tiếng Anh…"
                                            onChange={(e) => setNhap(e.target.value)}
                                        />
                                        <button type="submit" className="btn btn-primary" disabled={dang || !nhap.trim()}>Gửi</button>
                                    </form>
                                )}

                                {(canNoi || canGo) && (
                                    <div className="px-nut">
                                        {canNoi && (
                                            <button type="button" className="btn btn-secondary" disabled={dang || dangGhi} onClick={() => setGoThay(true)}>
                                                Không tiện nói — gõ thay
                                            </button>
                                        )}
                                        {/* Câu nói mà chưa biết cũng là bằng chứng cho kỹ năng Nói; câu đã chuyển sang gõ thì không. */}
                                        <button
                                            type="button"
                                            className="btn btn-secondary"
                                            disabled={dang || dangGhi}
                                            onClick={() => nop({ traLoi: '', cach: canNoi ? 'noi' : 'go' })}
                                        >
                                            Chưa biết
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
