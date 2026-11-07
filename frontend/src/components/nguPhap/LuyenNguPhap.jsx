import { useEffect, useRef, useState } from 'react';
import { GameLogic } from '@game/gameLogic.js';
import { NguPhapAPI } from '@api/nguPhap.js';

const TEN_DANG = { chon: 'Chọn đáp án đúng', sua: 'Sửa câu sai', dich: 'Dịch sang tiếng Anh' };

const phat = (text) => {
    if (!text) return;
    try {
        GameLogic.stopSpeaking?.();
        GameLogic.speakWord(text, 'en-US');
    } catch { /* không đọc được thì thôi */ }
};

/**
 * Luyện một công thức, 5 câu từ nhận ra đến tự dùng được: chọn → sửa → dịch. Đáp án chỉ về sau
 * khi chấm từng câu. `children` là nội dung công thức, để xem lại ngay khi làm sai.
 */
export default function LuyenNguPhap({ muc, onThoat, onXong, children }) {
    const [buoi, setBuoi] = useState(null);
    const [i, setI] = useState(0);
    const [nhap, setNhap] = useState('');
    const [ketQua, setKetQua] = useState(null);
    const [lichSu, setLichSu] = useState([]);
    const [tongKet, setTongKet] = useState(null);
    const [dang, setDang] = useState(false);
    const [loi, setLoi] = useState('');
    const [xemCongThuc, setXemCongThuc] = useState(false);
    const [lanMo, setLanMo] = useState(0);
    const oNhap = useRef(null);

    useEffect(() => {
        let huy = false;
        setBuoi(null);
        setI(0);
        setNhap('');
        setKetQua(null);
        setLichSu([]);
        setTongKet(null);
        setLoi('');
        setXemCongThuc(false);
        NguPhapAPI.moLuyen(muc.id)
            .then((b) => { if (!huy) setBuoi(b); })
            .catch((e) => { if (!huy) setLoi(e.message); });
        return () => { huy = true; };
    }, [muc.id, lanMo]);

    const cau = buoi?.cau?.[i];
    const canGo = cau && cau.loai !== 'chon';

    // Câu gõ: đặt sẵn con trỏ; câu sửa điền sẵn câu sai để chỉ phải sửa đúng chỗ.
    useEffect(() => {
        if (!cau || ketQua) return;
        setNhap(cau.loai === 'sua' ? cau.sai : '');
        if (cau.loai !== 'chon') oNhap.current?.focus();
    }, [cau, ketQua]);

    const nop = async (traLoi) => {
        if (dang || !buoi) return;
        setDang(true);
        try {
            const r = await NguPhapAPI.traLoiLuyen(buoi.id, i, traLoi);
            setKetQua({ ...r, cuaBan: traLoi });
            setLichSu((d) => [...d, { dung: r.dung, khongChac: r.khongChac }]);
            setXemCongThuc(false);
            if (r.tongKet) onXong?.();
            phat(r.dapAn);
        } catch (e) {
            // Server có thể đã giữ chỗ câu này nên không gửi lại được: cho sang câu tiếp, không tính.
            setKetQua({ dung: false, khongChac: true, dapAn: '', giaiThich: '', ghiChu: e.message, cuaBan: traLoi });
            setLichSu((d) => [...d, { dung: false, khongChac: true }]);
        } finally {
            setDang(false);
        }
    };

    const sangCau = () => {
        const tk = ketQua?.tongKet;
        setKetQua(null);
        setXemCongThuc(false);
        if (i + 1 >= buoi.cau.length) {
            // Câu cuối lỗi mạng thì không có tổng kết từ server: tự đếm để vẫn có màn kết.
            const chac = lichSu.filter((c) => !c.khongChac);
            setTongKet(tk || { soDung: chac.filter((c) => c.dung).length, tong: chac.length, dat: false, denHan: null });
            return;
        }
        setI(i + 1);
    };

    const guiGo = (e) => {
        e.preventDefault();
        if (nhap.trim()) nop(nhap.trim());
    };

    const ngayOn = tongKet?.denHan ? new Date(tongKet.denHan).toLocaleDateString('vi-VN') : '';

    return (
        <section className="np-luyen" aria-label={`Luyện ${muc.ten}`}>
            <div className="np-luyen-dau">
                <button type="button" className="lt-ke-hoach-link" onClick={onThoat}>
                    <i className="fas fa-arrow-left"></i> Về danh sách
                </button>
                <strong>{muc.ten}</strong>
            </div>

            {loi && (
                <>
                    <p className="px-mo-ta">{loi}</p>
                    <div className="px-nut">
                        <button type="button" className="btn btn-secondary" onClick={() => setLanMo((n) => n + 1)}>Thử lại</button>
                    </div>
                </>
            )}
            {!loi && !buoi && <p className="px-mo-ta"><i className="fas fa-spinner fa-spin"></i> Đang chuẩn bị câu luyện… Lần đầu của mỗi mục có thể mất vài giây.</p>}

            {cau && !tongKet && (
                <>
                    <div className="px-dau"><span>Câu {i + 1}/{buoi.cau.length} · {TEN_DANG[cau.loai]}</span></div>
                    <div className="px-gio" aria-hidden="true"><span style={{ width: `${(i / buoi.cau.length) * 100}%` }}></span></div>

                    {cau.loai === 'chon' && <p className="px-vi">{cau.de}</p>}
                    {cau.loai === 'sua' && <p className="px-vi np-luyen-nghia">{cau.vi}</p>}
                    {cau.loai === 'dich' && <p className="px-vi">{cau.vi}</p>}

                    {!ketQua && cau.loai === 'chon' && (
                        <div className="hs-lua">
                            {cau.lua.map((x) => (
                                <button key={x} type="button" className="btn btn-secondary" disabled={dang} onClick={() => nop(x)}>{x}</button>
                            ))}
                        </div>
                    )}

                    {!ketQua && canGo && (
                        <>
                            {cau.loai === 'sua' && <p className="px-goi-y">Câu dưới đây có một lỗi. Sửa lại cho đúng:</p>}
                            <form className="px-nhap" onSubmit={guiGo}>
                                <input
                                    ref={oNhap}
                                    value={nhap}
                                    disabled={dang}
                                    maxLength={240}
                                    autoComplete="off"
                                    spellCheck={false}
                                    aria-label={TEN_DANG[cau.loai]}
                                    placeholder="Gõ câu tiếng Anh…"
                                    onChange={(e) => setNhap(e.target.value)}
                                />
                                <button type="submit" className="btn btn-primary" disabled={dang || !nhap.trim()}>{dang ? '…' : 'Kiểm tra'}</button>
                            </form>
                            <div className="px-nut">
                                <button type="button" className="btn btn-secondary" disabled={dang} onClick={() => nop('')}>Chưa biết</button>
                            </div>
                        </>
                    )}

                    {ketQua && (
                        <>
                            <div className={`px-ket-qua ${ketQua.khongChac ? '' : ketQua.dung ? 'is-dung' : 'is-sai'}`} role="status">
                                <div className="px-ket-qua-dau">
                                    {ketQua.khongChac ? 'Chưa chấm được — câu này không tính'
                                        : ketQua.dung ? <><i className="fas fa-check"></i> Đúng rồi</>
                                            : <><i className="fas fa-xmark"></i> Chưa đúng</>}
                                </div>
                                {ketQua.dapAn && <p className="px-cau-dung">{ketQua.dapAn}</p>}
                                {ketQua.cuaBan && !ketQua.dung && <p className="px-cua-ban">Bạn: {ketQua.cuaBan}</p>}
                                {ketQua.giaiThich && <p className="px-ghi-chu">{ketQua.giaiThich}</p>}
                                {ketQua.ghiChu && <p className="px-ghi-chu">{ketQua.ghiChu}</p>}
                            </div>
                            <div className="px-nut">
                                {ketQua.dapAn && (
                                    <button type="button" className="btn btn-secondary" onClick={() => phat(ketQua.dapAn)}>
                                        <i className="fas fa-volume-high"></i> Nghe
                                    </button>
                                )}
                                {!ketQua.dung && (
                                    <button type="button" className="btn btn-secondary" onClick={() => setXemCongThuc((x) => !x)}>
                                        <i className="fas fa-spell-check"></i> {xemCongThuc ? 'Ẩn công thức' : 'Xem công thức'}
                                    </button>
                                )}
                                <button type="button" className="btn btn-primary" autoFocus onClick={sangCau}>
                                    {i + 1 >= buoi.cau.length ? 'Xem kết quả' : 'Câu tiếp'}
                                </button>
                            </div>
                            {xemCongThuc && <div className="np-luyen-cong-thuc">{children}</div>}
                        </>
                    )}
                </>
            )}

            {tongKet && (
                <>
                    <div className="px-so">
                        <div><strong>{tongKet.soDung}/{tongKet.tong}</strong><span>Câu đúng</span></div>
                        <div><strong>{tongKet.dat ? 'Đạt' : 'Chưa đạt'}</strong><span>Cần đúng từ 80%</span></div>
                        <div><strong>{ngayOn || '—'}</strong><span>Ôn lại vào</span></div>
                    </div>
                    <p className="px-mo-ta">
                        {tongKet.dat ? 'Bạn đã dùng được công thức này. Hệ thống sẽ nhắc ôn lại để bạn không quên.' : 'Đọc lại công thức rồi luyện thêm một lượt nhé.'}
                    </p>
                    {!tongKet.dat && <div className="np-luyen-cong-thuc">{children}</div>}
                    <div className="px-nut">
                        <button type="button" className="btn btn-primary" onClick={() => setLanMo((n) => n + 1)}>Luyện lượt nữa</button>
                        <button type="button" className="btn btn-secondary" onClick={onThoat}>Về danh sách</button>
                    </div>
                </>
            )}

            <p className="px-goi-y">Câu luyện do AI soạn và chưa được người soát.</p>
        </section>
    );
}
