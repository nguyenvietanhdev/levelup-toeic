import { useState } from 'react';
import { Notification } from '@ui/Toaster.jsx';
import ChuaBai from './ChuaBai.jsx';

/**
 * NỘP LẠI BÀI ĐÃ SỬA — sửa cả bài theo lời chữa rồi để AI xem lại.
 *
 * AI chỉ đối chiếu các lỗi đã chữa (đã sửa / chưa / sửa cách khác) và chỉ ra lỗi
 * MỚI phát sinh lúc sửa. Không điểm, không XP, tối đa 3 lần mỗi bài — server giữ
 * các luật đó; ở đây chỉ hiển thị.
 *
 * @param {string}   goc      bài lúc nộp chấm
 * @param {object[]} loi      lỗi đã chữa (thứ tự khớp `ketQua.loiCu[i]`)
 * @param {Function} gui      (noiDung) => Promise<{ ketQua, noiDung, lan, conLai }>
 * @param {object[]} daXem    các lần xem lại đã có (bài trong lịch sử)
 */
const MAX = 3;

const TRANG_THAI = {
    'da-sua': { nhan: 'Đã sửa', icon: 'fa-circle-check', lop: 'is-tot' },
    'sua-khac': { nhan: 'Sửa cách khác — vẫn ổn', icon: 'fa-circle-check', lop: 'is-tot' },
    'chua-sua': { nhan: 'Chưa sửa', icon: 'fa-circle-xmark', lop: 'is-xau' },
};

export default function XemLaiBai({ goc, loi, gui, daXem = [] }) {
    const cuoi = daXem.length ? daXem[daXem.length - 1] : null;
    const [lanGanNhat, setLanGanNhat] = useState(cuoi ? { ...cuoi, lan: daXem.length, conLai: MAX - daXem.length } : null);
    const [moSua, setMoSua] = useState(false);
    const [banSua, setBanSua] = useState('');
    const [dangGui, setDangGui] = useState(false);
    const [hetLuot, setHetLuot] = useState(daXem.length >= MAX);

    const conLai = lanGanNhat ? lanGanNhat.conLai : MAX - daXem.length;
    const banMoiNhat = lanGanNhat?.noiDung || goc;
    const ds = Array.isArray(loi) ? loi : [];
    if (!ds.length) return null;

    const batDauSua = () => { setBanSua(banMoiNhat); setMoSua(true); };

    const nop = async () => {
        if (dangGui) return;
        setDangGui(true);
        try {
            const d = await gui(banSua);
            setLanGanNhat(d);
            setMoSua(false);
            if (d.conLai <= 0) setHetLuot(true);
        } catch (e) {
            if (e?.conLai === 0 || /hết/.test(String(e?.message))) setHetLuot(true);
            Notification.error(String(e?.message || 'Chưa xem lại được, thử lại sau.'));
        } finally {
            setDangGui(false);
        }
    };

    const kq = lanGanNhat?.ketQua;

    return (
        <div className="xl-wrap">
            <div className="xl-dau">
                <h4><i className="fas fa-rotate"></i> Sửa cả bài &amp; nộp xem lại</h4>
                <span className="xl-luot">{hetLuot ? 'Đã hết lượt' : `Còn ${conLai}/${MAX} lượt`} · không tính điểm, không cộng XP</span>
            </div>

            {!moSua && !kq && (
                <p className="xl-goi-y">
                    Sửa lại bài theo các lỗi ở trên rồi nộp: AI cho biết lỗi nào đã hết, lỗi nào còn — và có lỗi mới nào lúc sửa không.
                </p>
            )}

            {kq && !moSua && (
                <div className="xl-ket-qua">
                    <div className="xl-tong">
                        Lần {lanGanNhat.lan}: đã sửa <strong>{kq.soDaSua}/{kq.loiCu.length}</strong> lỗi
                        {kq.loiMoi.length > 0 ? <> · <span className="is-xau">{kq.loiMoi.length} lỗi mới</span></> : null}
                    </div>
                    <ul className="xl-ds">
                        {kq.loiCu.map((l) => {
                            const goc1 = ds[l.i] || {};
                            const t = TRANG_THAI[l.trangThai] || TRANG_THAI['chua-sua'];
                            return (
                                <li key={l.i}>
                                    <span className={`xl-trang-thai ${t.lop}`}><i className={`fas ${t.icon}`}></i> {t.nhan}</span>
                                    <span className="xl-trich">“{goc1.quote || goc1.issue}”</span>
                                    {l.ghiChu && <span className="xl-ghi-chu">{l.ghiChu}</span>}
                                </li>
                            );
                        })}
                    </ul>
                    {kq.loiMoi.length > 0 && (
                        <ChuaBai text={lanGanNhat.noiDung} loi={kq.loiMoi} tieuDe="Lỗi mới khi sửa" />
                    )}
                </div>
            )}

            {moSua ? (
                <div className="xl-sua">
                    <textarea
                        value={banSua}
                        onChange={(e) => setBanSua(e.target.value)}
                        rows={10}
                        spellCheck={false}
                        aria-label="Bài đã sửa"
                    />
                    <div className="xl-nut">
                        <button type="button" className="btn btn-secondary" onClick={() => setMoSua(false)} disabled={dangGui}>Huỷ</button>
                        <button type="button" className="btn btn-primary" onClick={nop} disabled={dangGui || !banSua.trim()}>
                            {dangGui ? <><i className="fas fa-spinner fa-spin"></i> Đang xem lại…</> : <><i className="fas fa-paper-plane"></i> Nộp xem lại</>}
                        </button>
                    </div>
                </div>
            ) : (
                !hetLuot && (
                    <button type="button" className="btn btn-primary xl-mo" onClick={batDauSua}>
                        <i className="fas fa-pen"></i> {kq ? 'Sửa tiếp' : 'Sửa cả bài'}
                    </button>
                )
            )}
        </div>
    );
}
