import { useEffect, useMemo, useRef, useState } from 'react';
import {
    chuanHoaLoi, dinhViLoi, chiaManh, khopSua, chonHien, nhanLoai,
} from '@lib/chuaBai.js';

/**
 * CHỮA BÀI kiểu "bút đỏ của giáo viên" — chữa NGAY TRÊN bài của người học.
 *
 *   · Ba cách xem: Bài của bạn (gạch chân theo mức) · Đã sửa · So sánh (bỏ/thêm).
 *   · Bấm chỗ gạch chân → thẻ chi tiết: loại lỗi, giải thích, ô TỰ SỬA rồi kiểm tra,
 *     hoặc "Xem cách sửa". Tự sửa nhớ lâu hơn đọc đáp án có sẵn.
 *   · Mặc định hiện tối đa 8 lỗi (sai trước, nên-sửa sau) — "Xem tất cả" để hiện hết.
 *   · Phím ← → chuyển lỗi (khi không gõ trong ô nhập).
 *
 * @param {string}   text  bài làm của người học
 * @param {object[]} loi   lỗi từ bộ chấm (Viết: quote/issue/fix/type; Dịch: quote/issue/better/loai)
 */
const TOI_DA = 8;

function laDangGo(el) {
    return !!el?.closest?.('input, textarea, select, [contenteditable="true"]');
}

export default function ChuaBai({ text, loi, tieuDe = 'Chữa bài' }) {
    const ds = useMemo(() => (Array.isArray(loi) ? loi : []).map(chuanHoaLoi), [loi]);
    const { doan, khongThay } = useMemo(() => dinhViLoi(text, ds), [text, ds]);
    const [che, setChe] = useState('ban');
    const [xemHet, setXemHet] = useState(false);
    const [chon, setChon] = useState(null);
    // id → { nhap, ketQua: 'dung' | 'sai' | 'xem' }
    const [tuSua, setTuSua] = useState({});
    const goc = useRef(null);

    const hien = useMemo(() => (xemHet ? new Set(ds.map((l) => l.id)) : chonHien(ds, TOI_DA)), [ds, xemHet]);
    const doanHien = doan.filter((d) => hien.has(d.loi.id));
    const manh = useMemo(() => chiaManh(text, doanHien), [text, doanHien]);
    // Thứ tự đi qua các lỗi: theo vị trí trong bài, rồi tới lỗi không định vị được.
    const thuTu = [...doanHien.map((d) => d.loi), ...khongThay.filter((l) => hien.has(l.id))];
    const dangChon = thuTu.find((l) => l.id === chon) || null;

    const soLoi = ds.filter((l) => l.muc === 'loi').length;
    const soNen = ds.length - soLoi;
    const coTheTuSua = ds.filter((l) => l.suaDuoc);
    const daTuSua = coTheTuSua.filter((l) => tuSua[l.id]?.ketQua === 'dung').length;

    // ← → chuyển lỗi. Gắn khi component có mặt; bỏ qua khi đang gõ hoặc có popup.
    useEffect(() => {
        if (!thuTu.length) return undefined;
        const onKey = (e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            if (e.ctrlKey || e.metaKey || e.altKey || laDangGo(e.target)) return;
            if (document.querySelector('#modal-container.active')) return;
            e.preventDefault();
            const i = thuTu.findIndex((l) => l.id === chon);
            const buoc = e.key === 'ArrowRight' ? 1 : -1;
            const moi = i < 0 ? (buoc > 0 ? 0 : thuTu.length - 1) : (i + buoc + thuTu.length) % thuTu.length;
            setChon(thuTu[moi].id);
            if (che !== 'ban') setChe('ban');
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [thuTu, chon, che]);

    // Chọn lỗi thì cuộn tới chỗ gạch chân của nó.
    useEffect(() => {
        if (!chon) return;
        goc.current?.querySelector(`[data-loi="${CSS.escape(chon)}"]`)?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    }, [chon]);

    if (!ds.length) return null;

    const capNhat = (id, gt) => setTuSua((m) => ({ ...m, [id]: { ...m[id], ...gt } }));
    const kiemTra = (l) => {
        // Chưa gõ gì thì ô đang hiện nguyên trích dẫn — so đúng thứ người học nhìn thấy.
        const nhap = tuSua[l.id]?.nhap ?? l.quote;
        capNhat(l.id, { ketQua: khopSua(nhap, l.sua) ? 'dung' : 'sai' });
    };

    const veBai = () => manh.map((m, i) => {
        if (!m.loi) return <span key={i}>{m.chu}</span>;
        const l = m.loi;
        const ts = tuSua[l.id]?.ketQua;
        if (che === 'sua') {
            return <span key={i} className="cb-moi">{l.suaDuoc ? l.sua : m.chu}</span>;
        }
        if (che === 'so-sanh') {
            return (
                <span key={i}>
                    <del className="cb-bo">{m.chu}</del>
                    {l.suaDuoc && <ins className="cb-them">{l.sua}</ins>}
                </span>
            );
        }
        // `<span role="button">` chứ không phải `<button>`: button luôn là inline-block,
        // lỗi trải qua nhiều dòng bị vẽ thành một khối hộp thay vì chảy theo chữ.
        return (
            <span
                key={i}
                role="button"
                tabIndex={0}
                data-loi={l.id}
                className={`cb-gach is-${l.muc}${chon === l.id ? ' is-chon' : ''}${ts === 'dung' ? ' is-da-sua' : ''}`}
                onClick={() => setChon(l.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setChon(l.id); } }}
                title={nhanLoai(l.loai)}
            >
                {m.chu}
            </span>
        );
    });

    const viTri = dangChon ? thuTu.findIndex((l) => l.id === dangChon.id) : -1;
    const ts = dangChon ? tuSua[dangChon.id] || {} : {};

    return (
        <div className="cb-wrap" ref={goc}>
            <div className="cb-dau">
                <h4><i className="fas fa-marker"></i> {tieuDe}</h4>
                <div className="cb-dem">
                    {soLoi > 0 && <span className="cb-dem-loi" title="Lỗi cần sửa">{soLoi} lỗi</span>}
                    {soNen > 0 && <span className="cb-dem-nen" title="Đúng nhưng chưa tự nhiên">{soNen} nên sửa</span>}
                    {coTheTuSua.length > 0 && <span className="cb-dem-tu-sua">Tự sửa đúng {daTuSua}/{coTheTuSua.length}</span>}
                </div>
            </div>

            <div className="cb-tab" role="tablist">
                {[['ban', 'Bài của bạn'], ['sua', 'Đã sửa'], ['so-sanh', 'So sánh']].map(([k, nhan]) => (
                    <button
                        key={k}
                        type="button"
                        role="tab"
                        aria-selected={che === k}
                        className={che === k ? 'is-on' : ''}
                        onClick={() => setChe(k)}
                    >
                        {nhan}
                    </button>
                ))}
            </div>

            <div className="cb-than">
                <p className="cb-bai">{veBai()}</p>

                {che === 'ban' && (
                    <div className="cb-the" aria-live="polite">
                        {!dangChon ? (
                            <p className="cb-goi-y">
                                <i className="fas fa-hand-pointer"></i> Bấm vào chỗ gạch chân để xem lỗi và tự sửa
                                {' '}(hoặc dùng phím <kbd className="pt-kbd">←</kbd> <kbd className="pt-kbd">→</kbd>).
                            </p>
                        ) : (
                            <>
                                <div className="cb-the-dau">
                                    <span className={`cb-nhan is-${dangChon.muc}`}>
                                        {dangChon.muc === 'loi' ? 'Lỗi' : 'Nên sửa'} · {nhanLoai(dangChon.loai)}
                                    </span>
                                    <span className="cb-vi-tri">{viTri + 1}/{thuTu.length}</span>
                                </div>
                                {dangChon.quote && <div className="cb-trich">“{dangChon.quote}”</div>}
                                {dangChon.issue && <p className="cb-giai-thich">{dangChon.issue}</p>}

                                {dangChon.suaDuoc ? (
                                    ts.ketQua === 'dung' || ts.ketQua === 'xem' ? (
                                        <div className={`cb-ket-qua ${ts.ketQua === 'dung' ? 'is-dung' : ''}`}>
                                            {ts.ketQua === 'dung'
                                                ? <><i className="fas fa-circle-check"></i> Bạn sửa đúng: </>
                                                : <><i className="fas fa-eye"></i> Cách sửa: </>}
                                            <strong>{dangChon.sua}</strong>
                                        </div>
                                    ) : (
                                        <div className="cb-tu-sua">
                                            <label htmlFor={`cb-nhap-${dangChon.id}`}>Thử tự sửa:</label>
                                            <div className="cb-tu-sua-hang">
                                                <input
                                                    id={`cb-nhap-${dangChon.id}`}
                                                    type="text"
                                                    value={ts.nhap ?? dangChon.quote}
                                                    onChange={(e) => capNhat(dangChon.id, { nhap: e.target.value, ketQua: undefined })}
                                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); kiemTra(dangChon); } }}
                                                    autoComplete="off"
                                                    spellCheck={false}
                                                />
                                                <button type="button" className="btn btn-primary" onClick={() => kiemTra(dangChon)}>Kiểm tra</button>
                                            </div>
                                            {ts.ketQua === 'sai' && (
                                                <p className="cb-chua-khop">
                                                    Chưa khớp cách sửa gợi ý — có thể bạn đúng theo cách khác, thử lại hoặc xem cách sửa.
                                                </p>
                                            )}
                                            <button type="button" className="cb-xem" onClick={() => capNhat(dangChon.id, { ketQua: 'xem' })}>
                                                Xem cách sửa
                                            </button>
                                        </div>
                                    )
                                ) : (
                                    dangChon.sua && <div className="cb-ket-qua"><i className="fas fa-lightbulb"></i> {dangChon.sua}</div>
                                )}

                                <div className="cb-dieu-huong">
                                    <button type="button" className="btn btn-secondary" onClick={() => setChon(thuTu[(viTri - 1 + thuTu.length) % thuTu.length].id)}>
                                        <i className="fas fa-chevron-left"></i> Lỗi trước
                                    </button>
                                    <button type="button" className="btn btn-secondary" onClick={() => setChon(thuTu[(viTri + 1) % thuTu.length].id)}>
                                        Lỗi sau <i className="fas fa-chevron-right"></i>
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>

            {khongThay.some((l) => hien.has(l.id)) && che === 'ban' && (
                <div className="cb-khac">
                    <div className="cb-khac-tieu-de">Nhận xét khác (không trỏ được vào một chỗ trong bài)</div>
                    {khongThay.filter((l) => hien.has(l.id)).map((l) => (
                        <button key={l.id} type="button" className={`cb-khac-muc${chon === l.id ? ' is-chon' : ''}`} onClick={() => setChon(l.id)}>
                            <span className={`cb-cham is-${l.muc}`} /> {l.quote ? `“${l.quote}” — ` : ''}{l.issue}
                        </button>
                    ))}
                </div>
            )}

            {ds.length > TOI_DA && (
                <button type="button" className="cb-xem-het" onClick={() => setXemHet((x) => !x)}>
                    {xemHet ? `Chỉ hiện ${TOI_DA} lỗi quan trọng nhất` : `Xem tất cả ${ds.length} lỗi`}
                </button>
            )}
        </div>
    );
}
