import { useEffect, useRef, useState } from 'react';
import { NguPhapAPI } from '@api/nguPhap.js';
import NutMauCau from './NutMauCau.jsx';

const TEN_LOAI = { chon: 'Chọn đáp án', sua: 'Sửa câu sai', dich: 'Dịch' };

const gio = (luc) => {
    const d = new Date(luc);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
};

/**
 * Lịch sử các câu ngữ pháp đã làm (luyện từng mục và kiểm tra tổng hợp), mới nhất trước.
 * Mỗi câu nghe lại được cả câu và lưu vào Từ vựng riêng.
 */
export default function LichSuNguPhap({ lang, onThoat }) {
    const [ds, setDs] = useState([]);
    const [conNua, setConNua] = useState(false);
    const [chiSai, setChiSai] = useState(false);
    const [dang, setDang] = useState(true);
    const [loi, setLoi] = useState('');
    const lan = useRef(0);

    const tai = async (truoc = '') => {
        lan.current += 1;
        const cua = lan.current;
        setDang(true);
        setLoi('');
        try {
            const r = await NguPhapAPI.lichSu(lang, { truoc, chiSai });
            if (cua !== lan.current) return;
            setDs((cu) => (truoc ? [...cu, ...r.ds] : r.ds));
            setConNua(!!r.conNua);
        } catch (e) {
            if (cua === lan.current) setLoi(e.message);
        } finally {
            if (cua === lan.current) setDang(false);
        }
    };

    useEffect(() => { setDs([]); tai(); }, [lang, chiSai]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <section className="np-lich-su" aria-label="Lịch sử câu ngữ pháp đã làm">
            <div className="np-luyen-dau">
                <button type="button" className="lt-ke-hoach-link" onClick={onThoat}>
                    <i className="fas fa-arrow-left"></i> Về danh sách
                </button>
                <strong>Lịch sử câu đã làm</strong>
            </div>

            <div className="np-nhom">
                <button type="button" className={!chiSai ? 'is-chon' : ''} aria-pressed={!chiSai} onClick={() => setChiSai(false)}>Tất cả</button>
                <button type="button" className={chiSai ? 'is-chon' : ''} aria-pressed={chiSai} onClick={() => setChiSai(true)}>Chỉ câu sai</button>
            </div>

            {loi && <p className="px-mo-ta" role="alert">{loi}</p>}
            {!loi && !dang && !ds.length && (
                <p className="px-mo-ta">{chiSai ? 'Chưa có câu nào làm sai. Tốt lắm!' : 'Chưa có câu nào. Luyện một công thức hoặc làm kiểm tra tổng hợp để bắt đầu.'}</p>
            )}

            <ul className="np-ls-ds">
                {ds.map((c) => {
                    const cauDung = c.cauDu || c.dapAn;
                    return (
                        <li key={c.id} className={c.khongChac ? '' : c.dung ? 'is-dung' : 'is-sai'}>
                            <div className="np-ls-dau">
                                <span className="np-ls-nhan">
                                    {c.khongChac ? 'Không tính' : c.dung ? <><i className="fas fa-check"></i> Đúng</> : <><i className="fas fa-xmark"></i> Sai</>}
                                </span>
                                <span>{c.tenMuc || 'Ngữ pháp'} · {TEN_LOAI[c.loai] || ''}{c.tongHop ? ' · Tổng hợp' : ''}</span>
                                <time>{gio(c.luc)}</time>
                            </div>
                            {c.de && <p className="np-ls-de">{c.de}</p>}
                            {c.cuaBan && !c.dung && <p className="px-cua-ban">Bạn: {c.cuaBan}</p>}
                            {!c.cuaBan && !c.dung && !c.khongChac && <p className="px-cua-ban">Bạn: (chưa biết)</p>}
                            {cauDung && <p className="px-cau-dung">{cauDung}</p>}
                            {c.giaiThich && <p className="px-ghi-chu">{c.giaiThich}</p>}
                            <div className="px-nut">
                                <NutMauCau cau={cauDung} nghia={c.nghia} lang={c.lang || lang} tenMuc={c.tenMuc} nho />
                            </div>
                        </li>
                    );
                })}
            </ul>

            {dang && <p className="px-mo-ta"><i className="fas fa-spinner fa-spin"></i> Đang tải…</p>}
            {!dang && conNua && (
                <div className="px-nut">
                    <button type="button" className="btn btn-secondary" onClick={() => tai(ds[ds.length - 1]?.luc)}>Xem thêm</button>
                </div>
            )}
        </section>
    );
}
