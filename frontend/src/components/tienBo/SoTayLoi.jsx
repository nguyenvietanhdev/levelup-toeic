import { useEffect, useMemo, useState } from 'react';
import { TienBoAPI } from '@api/tienBo.js';
import { khopSua, coTiengViet } from '@lib/chuaBai.js';
import OnLoi from './OnLoi.jsx';

/**
 * SỔ TAY LỖI — mọi lỗi đã được chữa trong bài Viết và Dịch, kèm cách sửa.
 *
 * Gom theo LOẠI LỖI để thấy lại chính những câu mình từng sai đặt cạnh nhau.
 * Chế độ "Tự kiểm tra" che cách sửa đi: nhìn câu sai, tự gõ lại, rồi mới so — đọc
 * lại đáp án thì thấy quen, tự viết lại được mới là nhớ.
 *
 * Dữ liệu do server gom (không gọi AI); tải khi mở tab.
 */
const NGUON = { viet: 'Luyện viết', dich: 'Dịch đoạn văn', noi: 'Hội thoại' };

const ngay = (d) => {
    const t = new Date(d);
    return Number.isNaN(t.getTime()) ? '' : `${String(t.getDate()).padStart(2, '0')}/${String(t.getMonth() + 1).padStart(2, '0')}`;
};

function MucLoi({ m, tuKiemTra }) {
    const [nhap, setNhap] = useState('');
    const [kq, setKq] = useState(null); // 'dung' | 'sai' | 'xem'
    // Cụm sửa tiếng Việt (bài chấm cũ) là lời giải thích, không so được.
    const soDuoc = !!m.sua && !coTiengViet(m.sua);
    const che = tuKiemTra && soDuoc && kq !== 'dung' && kq !== 'xem';

    return (
        <li className={`stl-muc is-${m.muc}`}>
            <div className="stl-cau">
                {m.quote && <del className="cb-bo">{m.quote}</del>}
                {!che && m.sua && (
                    soDuoc
                        ? <><i className="fas fa-arrow-right stl-mui-ten" aria-hidden="true"></i><ins className="cb-them">{m.sua}</ins></>
                        : <span className="stl-ghi-chu">{m.sua}</span>
                )}
            </div>
            {m.issue && <p className="stl-giai-thich">{m.issue}</p>}
            {che && (
                <div className="stl-tu-kiem-tra">
                    <input
                        type="text"
                        value={nhap}
                        placeholder="Gõ lại cho đúng…"
                        onChange={(e) => { setNhap(e.target.value); setKq(null); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setKq(khopSua(nhap, m.sua) ? 'dung' : 'sai'); } }}
                        autoComplete="off"
                        spellCheck={false}
                        aria-label={`Sửa lại: ${m.quote}`}
                    />
                    <button type="button" className="btn btn-primary" onClick={() => setKq(khopSua(nhap, m.sua) ? 'dung' : 'sai')}>Kiểm tra</button>
                    <button type="button" className="cb-xem" onClick={() => setKq('xem')}>Xem</button>
                    {kq === 'sai' && <span className="cb-chua-khop">Chưa khớp — thử lại hoặc bấm Xem.</span>}
                </div>
            )}
            {tuKiemTra && kq === 'dung' && <div className="cb-ket-qua is-dung"><i className="fas fa-circle-check"></i> Chính xác!</div>}
            <div className="stl-chan">
                <span className={`cb-nhan is-${m.muc}`}>{m.muc === 'loi' ? 'Lỗi' : 'Nên sửa'}</span>
                <span>{NGUON[m.nguon] || m.nguon} · {ngay(m.at)}</span>
            </div>
        </li>
    );
}

/**
 * Tab Sổ tay lỗi: trên cùng là KIỂM TRA LẠI (buổi ôn theo nấc), dưới là danh sách lỗi.
 * Đang làm buổi ôn thì ẩn danh sách — nó lộ sẵn cách sửa của chính các câu đang hỏi.
 * Ôn xong danh sách mount lại, tải dữ liệu mới.
 */
export default function SoTayLoi({ active }) {
    const [dangOn, setDangOn] = useState(false);
    return (
        <div className="stl-ngoai">
            <OnLoi active={active} onDangLam={setDangOn} />
            {!dangOn && <DanhSachLoi active={active} />}
        </div>
    );
}

function DanhSachLoi({ active }) {
    const [data, setData] = useState(null);
    const [loi, setLoi] = useState('');
    const [loai, setLoai] = useState('');      // '' = mọi loại
    const [muc, setMuc] = useState('');        // '' | 'loi' | 'nen'
    const [tuKiemTra, setTuKiemTra] = useState(false);

    useEffect(() => {
        if (!active) return undefined;
        let huy = false;
        setLoi('');
        TienBoAPI.soTayLoi()
            .then((d) => { if (!huy) setData(d); })
            .catch((e) => { if (!huy) setLoi(e?.message || 'Không tải được sổ tay lỗi'); });
        return () => { huy = true; };
    }, [active]);

    const loc = useMemo(
        () => (data?.muc || []).filter((m) => (!loai || m.loai === loai) && (!muc || m.muc === muc)),
        [data, loai, muc],
    );
    // Gom theo loại để đọc từng nhóm một — giữ thứ tự nhóm của server (nhiều lỗi nhất trước).
    const theoNhom = useMemo(() => {
        const thuTu = (data?.nhom || []).map((n) => n.key);
        const g = new Map(thuTu.map((k) => [k, []]));
        for (const m of loc) (g.get(m.loai) || g.set(m.loai, []).get(m.loai)).push(m);
        return [...g.entries()].filter(([, ds]) => ds.length);
    }, [data, loc]);
    const nhan = (k) => data?.nhom?.find((n) => n.key === k);

    if (loi) return <p className="tr-intro-note">{loi}</p>;
    if (!data) return <p className="tr-intro-note"><i className="fas fa-spinner fa-spin"></i> Đang tải…</p>;
    if (!data.tong) {
        return (
            <p className="tr-intro-note">
                Chưa có lỗi nào được chữa trong {data.soNgay} ngày qua. Làm bài <strong>Luyện viết</strong> hoặc{' '}
                <strong>Dịch đoạn văn</strong> — mọi chỗ AI chữa sẽ được ghi vào đây.
            </p>
        );
    }

    return (
        <div className="stl-wrap">
            <p className="tb-gioi-thieu">
                <strong>{data.tong}</strong> chỗ đã được chữa trong {data.soNgay} ngày qua, từ bài Viết và Dịch.
                Bật <strong>Tự kiểm tra</strong> để che cách sửa và tự viết lại.
            </p>

            <div className="stl-loc">
                <button type="button" className={`rd-chip${!loai ? ' is-on' : ''}`} onClick={() => setLoai('')}>
                    Tất cả <span className="stl-so">{data.tong}</span>
                </button>
                {data.nhom.map((n) => (
                    <button key={n.key} type="button" className={`rd-chip${loai === n.key ? ' is-on' : ''}`} onClick={() => setLoai(n.key)}>
                        {n.vi} <span className="stl-so">{n.count}</span>
                    </button>
                ))}
            </div>
            <div className="stl-loc stl-loc-phu">
                {[['', 'Mọi mức'], ['loi', 'Chỉ lỗi'], ['nen', 'Chỉ nên sửa']].map(([k, t]) => (
                    <button key={k || 'tat-ca'} type="button" className={`rd-chip${muc === k ? ' is-on' : ''}`} onClick={() => setMuc(k)}>{t}</button>
                ))}
                <button
                    type="button"
                    className={`nham-yeu stl-tu-kiem${tuKiemTra ? ' is-on' : ''}`}
                    aria-pressed={tuKiemTra}
                    onClick={() => setTuKiemTra((x) => !x)}
                >
                    <i className={`fas ${tuKiemTra ? 'fa-toggle-on' : 'fa-toggle-off'}`}></i> Tự kiểm tra
                </button>
            </div>

            {theoNhom.length === 0 && <p className="tr-intro-note">Không có mục nào khớp bộ lọc.</p>}
            {theoNhom.map(([k, ds]) => (
                <section key={k} className="stl-nhom">
                    <h3 className="tb-muc">{nhan(k)?.vi || k} <small>({ds.length})</small></h3>
                    {nhan(k)?.hint && <p className="tb-loi-goi-y"><i className="fas fa-lightbulb"></i> {nhan(k).hint}</p>}
                    {/* `key` gồm cả chế độ: đổi Tự kiểm tra là làm mới ô nhập của mọi mục. */}
                    <ul className="stl-ds">
                        {ds.map((m) => <MucLoi key={`${m.id}-${tuKiemTra}`} m={m} tuKiemTra={tuKiemTra} />)}
                    </ul>
                </section>
            ))}
        </div>
    );
}
