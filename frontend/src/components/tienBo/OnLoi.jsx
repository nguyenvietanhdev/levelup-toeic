import { useEffect, useMemo, useState } from 'react';
import { Notification } from '@ui/Toaster.jsx';
import { OnLoiAPI } from '@api/onLoi.js';

/**
 * KIỂM TRA LẠI LỖI ĐÃ CHỮA — trả lời: còn nhớ lỗi không, biết sửa không, hay học vẹt?
 *
 * Mỗi lỗi đi qua 4 nấc (server quyết định dạng câu theo nấc):
 *   Nhận ra (bấm chỗ sai) → Sửa được → Hiểu vì sao → Áp dụng (CÂU MỚI cùng loại lỗi).
 * "Đã nắm" chỉ khi qua câu mới ở 2 ngày khác nhau. Xen vài câu "Đúng hay sai" để bắt
 * thói quen sửa bừa. Đáp án ở server — chấm từng câu ngay khi trả lời.
 */
const TEN_DANG = {
    'tim-loi': 'Nhận ra lỗi',
    'sua-loi': 'Sửa lỗi',
    'ly-do': 'Hiểu vì sao',
    'cau-moi': 'Câu mới — áp dụng',
    'dung-sai': 'Đúng hay sai?',
};
const HUONG_DAN = {
    'tim-loi': 'Câu này của bạn có một chỗ sai. Bấm vào (các) từ sai.',
    'sua-loi': 'Chỗ tô vàng là chỗ sai. Gõ lại cho đúng.',
    'ly-do': 'Vì sao phải sửa như vậy? Chọn loại lỗi.',
    'cau-moi': 'Một câu MỚI cùng loại lỗi. Bấm vào chỗ sai rồi gõ cách sửa.',
    'dung-sai': 'Câu này đã đúng chưa?',
};
const NAC = ['Nhận ra', 'Sửa được', 'Hiểu vì sao', 'Áp dụng'];

/** Tách câu thành các mảnh bấm được: tiếng Anh theo từ, tiếng Trung theo từng chữ. */
function tachManh(cau, lang) {
    const out = [];
    const re = lang === 'zh' ? /\S/gu : /\S+/g;
    let m;
    while ((m = re.exec(cau)) !== null) out.push({ chu: m[0], start: m.index, end: m.index + m[0].length });
    return out;
}

/** Câu với các mảnh bấm chọn được; chọn = khoảng từ mảnh đầu tới mảnh cuối đã bấm. */
function CauBam({ cau, lang, chon, onChon, khoa }) {
    const manh = useMemo(() => tachManh(cau, lang), [cau, lang]);
    return (
        <p className={`ol-cau ol-cau-bam${lang === 'zh' ? ' is-zh' : ''}`}>
            {manh.map((m, i) => (
                <button
                    key={`${m.start}-${i}`}
                    type="button"
                    className={`ol-manh${chon.has(i) ? ' is-chon' : ''}`}
                    disabled={khoa}
                    onClick={() => onChon((s) => {
                        const n = new Set(s);
                        if (n.has(i)) n.delete(i); else n.add(i);
                        return n;
                    })}
                >
                    {m.chu}
                </button>
            ))}
        </p>
    );
}

const khoangChon = (cau, lang, chon) => {
    const manh = tachManh(cau, lang);
    const ds = [...chon].sort((a, b) => a - b).map((i) => manh[i]).filter(Boolean);
    return ds.length ? { start: ds[0].start, end: ds[ds.length - 1].end } : null;
};

/** Câu với một đoạn tô (chỗ sai) hoặc gạch-đổi (đáp án). */
function CauTo({ cau, start, end, sua, lop = 'ol-to' }) {
    if (!Number.isInteger(start) || !Number.isInteger(end)) return <p className="ol-cau">{cau}</p>;
    return (
        <p className="ol-cau">
            {cau.slice(0, start)}
            {sua !== undefined
                ? <><del className="cb-bo">{cau.slice(start, end)}</del><ins className="cb-them">{sua}</ins></>
                : <mark className={lop}>{cau.slice(start, end)}</mark>}
            {cau.slice(end)}
        </p>
    );
}

function DapAn({ cau, kq }) {
    const da = kq.dapAn || {};
    const t = kq.trangThai;
    return (
        <div className={`ol-ket-qua ${kq.dung ? 'is-dung' : 'is-sai'}`}>
            <div className="ol-ket-qua-dau">
                {kq.dung ? <><i className="fas fa-circle-check"></i> Chính xác!</> : <><i className="fas fa-circle-xmark"></i> Chưa đúng</>}
            </div>
            {(cau.dang === 'tim-loi' || cau.dang === 'sua-loi') && (
                <>
                    <CauTo cau={cau.de.cau} start={da.start} end={da.end} sua={da.sua} />
                    {da.issue && <p className="ol-giai-thich">{da.issue}</p>}
                </>
            )}
            {cau.dang === 'ly-do' && (
                <p className="ol-giai-thich">
                    Loại lỗi: <strong>{da.vi}</strong>{da.hint ? ` — ${da.hint}` : ''}
                    {da.issue ? <><br />{da.issue}</> : null}
                </p>
            )}
            {cau.dang === 'cau-moi' && (
                <>
                    <CauTo cau={cau.de.cau} start={da.start} end={da.end} sua={da.sua} />
                    {da.giaiThich && <p className="ol-giai-thich">{da.giaiThich}</p>}
                </>
            )}
            {cau.dang === 'dung-sai' && (
                <p className="ol-giai-thich">
                    {da.coLoi
                        ? <>Câu này <strong>có lỗi</strong>: “{da.quote}” → “{da.sua}”. Câu đúng: <em>{da.cauDung}</em></>
                        : <>Câu này <strong>đã đúng</strong> — không cần sửa gì.</>}
                </p>
            )}
            {t?.moiDaNam && <p className="ol-nhan is-tot"><i className="fas fa-trophy"></i> Đã nắm lỗi này — đúng câu mới ở 2 ngày khác nhau.</p>}
            {t?.moiNghiHocVet && (
                <p className="ol-nhan is-xau">
                    <i className="fas fa-triangle-exclamation"></i> Nghi học vẹt: bạn sửa đúng câu cũ nhưng chưa áp dụng được vào câu mới. Ôn lại quy tắc nhé.
                </p>
            )}
        </div>
    );
}

export default function OnLoi({ active, onDangLam }) {
    const [tq, setTq] = useState(null);
    const [buoi, setBuoi] = useState(null);
    const [i, setI] = useState(0);
    const [ketQua, setKetQua] = useState([]); // kết quả từng câu
    const [dang, setDang] = useState(false);
    // Trả lời của câu hiện tại
    const [chon, setChon] = useState(new Set());
    const [sua, setSua] = useState('');

    const taiTongQuan = () => OnLoiAPI.tongQuan().then(setTq).catch(() => { /* phần thêm */ });
    useEffect(() => { if (active) taiTongQuan(); }, [active]);
    useEffect(() => { onDangLam?.(!!buoi); }, [buoi, onDangLam]);

    const batDau = async (som = false) => {
        if (dang) return;
        setDang(true);
        try {
            const b = await OnLoiAPI.taoBuoi(som);
            if (!b?.cau?.length) {
                Notification.info('Chưa có lỗi nào để kiểm tra.');
                return;
            }
            setBuoi(b); setI(0); setKetQua([]); setChon(new Set()); setSua('');
        } catch (e) {
            Notification.error(String(e?.message || 'Không mở được buổi kiểm tra'));
        } finally {
            setDang(false);
        }
    };

    const cau = buoi?.cau?.[i];
    const kq = ketQua[i];

    const coTheNop = () => {
        if (!cau || kq) return false;
        if (cau.dang === 'tim-loi') return chon.size > 0;
        if (cau.dang === 'sua-loi') return !!sua.trim();
        if (cau.dang === 'cau-moi') return chon.size > 0 && !!sua.trim();
        return false; // ly-do, dung-sai: nộp bằng nút lựa chọn
    };

    const nop = async (body) => {
        if (dang || kq) return;
        setDang(true);
        try {
            const r = await OnLoiAPI.traLoi(buoi.id, i, body);
            setKetQua((k) => { const n = [...k]; n[i] = r; return n; });
        } catch (e) {
            Notification.error(String(e?.message || 'Chưa chấm được, thử lại.'));
        } finally {
            setDang(false);
        }
    };
    const nopThuong = () => {
        if (!coTheNop()) return;
        const khoang = khoangChon(cau.de.cau, cau.de.lang, chon);
        if (cau.dang === 'tim-loi') nop({ chon: khoang });
        else if (cau.dang === 'sua-loi') nop({ sua });
        else if (cau.dang === 'cau-moi') nop({ chon: khoang, sua });
    };
    const tiep = () => { setI((x) => x + 1); setChon(new Set()); setSua(''); };
    const ketThuc = () => { setBuoi(null); taiTongQuan(); };

    // Enter: nộp, rồi Enter lần nữa sang câu tiếp.
    useEffect(() => {
        if (!buoi) return undefined;
        const onKey = (e) => {
            if (e.key !== 'Enter' || e.isComposing) return;
            if (document.querySelector('#modal-container.active')) return;
            // Enter ở ô nhập khác (ô tìm kiếm…) là việc của ô đó — chỉ nhận ô trả lời của buổi.
            const o = e.target?.closest?.('input, textarea, select, [contenteditable="true"]');
            if (o && !o.classList.contains('ol-nhap')) return;
            if (kq) { e.preventDefault(); tiep(); return; }
            if (coTheNop()) { e.preventDefault(); nopThuong(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    // ── Chưa trong buổi: thẻ tổng quan ──
    if (!buoi) {
        return (
            <div className="ol-the">
                <div className="ol-the-dau"><i className="fas fa-clipboard-check"></i> Kiểm tra lại lỗi đã chữa</div>
                <p className="ol-the-mo-ta">
                    Nhận ra lỗi → sửa được → hiểu vì sao → <strong>áp dụng vào câu mới</strong>. Một lỗi chỉ tính là
                    <strong> đã nắm</strong> khi làm đúng câu mới ở 2 ngày khác nhau — để biết bạn nhớ thật, không học vẹt.
                </p>
                {tq && (
                    <div className="ol-so">
                        <div><strong>{tq.tong}</strong><span>lỗi đang theo dõi</span></div>
                        <div className={tq.denHan ? 'is-can' : ''}><strong>{tq.denHan}</strong><span>đến hạn ôn</span></div>
                        <div className="is-tot"><strong>{tq.daNam}</strong><span>đã nắm</span></div>
                        <div className={tq.nghiHocVet ? 'is-xau' : ''}><strong>{tq.nghiHocVet}</strong><span>nghi học vẹt</span></div>
                    </div>
                )}
                <div className="ol-nut">
                    {tq?.denHan > 0 ? (
                        <button type="button" className="btn btn-primary" onClick={() => batDau(false)} disabled={dang}>
                            {dang ? <><i className="fas fa-spinner fa-spin"></i> Đang chuẩn bị…</> : <><i className="fas fa-play"></i> Kiểm tra lại ({Math.min(tq.denHan, 8)} lỗi)</>}
                        </button>
                    ) : (
                        <>
                            <span className="ol-chua">
                                {tq?.tong ? `Chưa có lỗi nào đến hạn${tq.lanToi ? ` — lần tới: ${new Date(tq.lanToi).toLocaleDateString('vi-VN')}` : ''}.` : 'Chưa có lỗi nào kiểm tra được — làm bài Viết, Dịch hoặc Hội thoại trước.'}
                            </span>
                            {tq?.tong > 0 && (
                                <button type="button" className="btn btn-secondary" onClick={() => batDau(true)} disabled={dang}>Ôn trước</button>
                            )}
                        </>
                    )}
                </div>
            </div>
        );
    }

    // ── Hết câu: tổng kết ──
    if (i >= buoi.cau.length) {
        const soDung = ketQua.filter((k) => k?.dung).length;
        const daNam = ketQua.filter((k) => k?.trangThai?.moiDaNam).length;
        const hocVet = ketQua.filter((k) => k?.trangThai?.moiNghiHocVet).length;
        return (
            <div className="ol-the ol-tong-ket">
                <div className="ol-the-dau"><i className="fas fa-flag-checkered"></i> Xong buổi kiểm tra</div>
                <p className="ol-diem">Đúng <strong>{soDung}/{buoi.cau.length}</strong> câu</p>
                {daNam > 0 && <p className="ol-nhan is-tot"><i className="fas fa-trophy"></i> Nắm thêm {daNam} lỗi.</p>}
                {hocVet > 0 && <p className="ol-nhan is-xau"><i className="fas fa-triangle-exclamation"></i> {hocVet} lỗi nghi học vẹt — sẽ ôn lại sớm.</p>}
                <p className="ol-the-mo-ta">Lỗi làm đúng sẽ hẹn ôn lại thưa dần (1 → 3 → 7 → 14 ngày); lỗi làm sai hẹn ngày mai.</p>
                <div className="ol-nut"><button type="button" className="btn btn-primary" onClick={ketThuc}>Xong</button></div>
            </div>
        );
    }

    // ── Đang làm một câu ──
    return (
        <div className="ol-the ol-buoi">
            <div className="ol-buoi-dau">
                <span className="ol-dang">{TEN_DANG[cau.dang]}</span>
                <span className="ol-tien-do">Câu {i + 1}/{buoi.cau.length}</span>
                <button type="button" className="cb-xem" onClick={ketThuc}>Dừng</button>
            </div>
            <div className="lt-thanh"><span style={{ width: `${(i / buoi.cau.length) * 100}%` }} /></div>
            <p className="ol-huong-dan">{HUONG_DAN[cau.dang]}</p>

            {(cau.dang === 'tim-loi' || cau.dang === 'cau-moi') && (
                <CauBam cau={cau.de.cau} lang={cau.de.lang} chon={chon} onChon={setChon} khoa={!!kq} />
            )}
            {cau.dang === 'sua-loi' && <CauTo cau={cau.de.cau} start={cau.de.start} end={cau.de.end} />}
            {(cau.dang === 'sua-loi' || cau.dang === 'cau-moi') && !kq && (
                <input
                    className="ol-nhap"
                    type="text"
                    value={sua}
                    onChange={(e) => setSua(e.target.value)}
                    placeholder={cau.dang === 'sua-loi' ? 'Gõ phần đã sửa…' : 'Sửa chỗ đã chọn thành…'}
                    autoComplete="off"
                    spellCheck={false}
                    aria-label="Cách sửa"
                />
            )}
            {cau.dang === 'ly-do' && (
                <>
                    <p className="ol-cau">“{cau.de.quote}” → “{cau.de.sua}”</p>
                    <div className="ol-lua">
                        {cau.de.lua.map((l) => (
                            <button key={l.key} type="button" className="btn btn-secondary" disabled={!!kq || dang} onClick={() => nop({ loai: l.key })}>
                                {l.vi}
                            </button>
                        ))}
                    </div>
                </>
            )}
            {cau.dang === 'dung-sai' && (
                <>
                    <p className="ol-cau">{cau.de.cau}</p>
                    <div className="ol-lua">
                        <button type="button" className="btn btn-secondary" disabled={!!kq || dang} onClick={() => nop({ coLoi: false })}>Đúng rồi</button>
                        <button type="button" className="btn btn-secondary" disabled={!!kq || dang} onClick={() => nop({ coLoi: true })}>Có lỗi</button>
                    </div>
                </>
            )}

            {kq ? (
                <>
                    <DapAn cau={cau} kq={kq} />
                    <div className="ol-nut"><button type="button" className="btn btn-primary" onClick={tiep}>Câu tiếp <i className="fas fa-arrow-right"></i></button></div>
                </>
            ) : (cau.dang === 'tim-loi' || cau.dang === 'sua-loi' || cau.dang === 'cau-moi') && (
                <div className="ol-nut">
                    <button type="button" className="btn btn-primary" onClick={nopThuong} disabled={!coTheNop() || dang}>Kiểm tra</button>
                </div>
            )}
            <p className="ol-chu-y">Nấc: {NAC.join(' → ')}</p>
        </div>
    );
}
