import { useEffect, useRef, useState } from 'react';
import { GameLogic } from '@game/gameLogic.js';
import { useAuth } from '@components/auth/AuthContext.jsx';
import { Notification } from '@ui/Toaster.jsx';
import { NguPhapAPI } from '@api/nguPhap.js';

const CHO_GO_MS = 250;

const phat = (text) => {
    try {
        GameLogic.stopSpeaking?.();
        GameLogic.speakWord(text, 'en-US');
    } catch { /* không đọc được thì thôi */ }
};

/** Một câu ví dụ, bấm loa để nghe. */
function ViDu({ v }) {
    return (
        <li>
            <button type="button" className="np-loa" aria-label={`Nghe: ${v.en}`} onClick={() => phat(v.en)}>
                <i className="fas fa-volume-high"></i>
            </button>
            <span>
                {v.en}
                <small>{v.vi}</small>
            </span>
        </li>
    );
}

/** Công thức, cách dùng, ví dụ: dùng chung cho mục đã có và bản nháp. */
function NoiDungMuc({ m }) {
    return (
        <>
            <dl className="np-cong-thuc">
                {m.congThuc.map((c) => (
                    <div key={`${c.nhan}${c.ct}`}>
                        <dt>{c.nhan}</dt>
                        <dd><code>{c.ct}</code></dd>
                    </div>
                ))}
            </dl>
            <h4>Khi nào dùng</h4>
            <ul className="np-dung">{m.dung.map((d) => <li key={d}>{d}</li>)}</ul>
            <h4>Ví dụ</h4>
            <ul className="np-vi-du">{m.vd.map((v) => <ViDu key={v.en} v={v} />)}</ul>
            {m.viDuThem?.length > 0 && (
                <>
                    <h4 className="np-ai-tieu-de"><i className="fas fa-wand-magic-sparkles"></i> Ví dụ do AI thêm</h4>
                    <ul className="np-vi-du">{m.viDuThem.map((v) => <ViDu key={v.en} v={v} />)}</ul>
                </>
            )}
            {m.luuY && <p className="np-luu-y"><i className="fas fa-triangle-exclamation"></i> {m.luuY}</p>}
            {m.nguon === 'ai' && <p className="px-goi-y">Nội dung này do AI tạo và chưa được người soát, nên đối chiếu khi cần độ chính xác cao.</p>}
        </>
    );
}

/** Một mục ngữ pháp, bấm tiêu đề để mở. */
function TheMuc({ m, mo, onDoi, onThemViDu, dangThem, hetLuot }) {
    return (
        <article className={`np-the ${mo ? 'is-mo' : ''}`} data-np-id={m.id}>
            <button type="button" className="np-dau" aria-expanded={mo} onClick={onDoi}>
                <strong>{m.ten}</strong>
                {m.nguon === 'ai' && <span className="np-nhan-ai"><i className="fas fa-wand-magic-sparkles"></i> AI tạo</span>}
                <i className={`fas fa-chevron-${mo ? 'up' : 'down'}`}></i>
            </button>
            {mo && (
                <div className="np-than">
                    <NoiDungMuc m={m} />
                    <div className="px-nut">
                        <button type="button" className="btn btn-secondary" disabled={dangThem || hetLuot} onClick={onThemViDu}>
                            <i className="fas fa-wand-magic-sparkles"></i> {dangThem ? 'Đang tạo…' : 'Thêm ví dụ bằng AI'}
                        </button>
                    </div>
                </div>
            )}
        </article>
    );
}

/**
 * Phần tra cứu của Công thức ngữ pháp, dùng chung cho màn riêng và ngăn mở trong lúc luyện tập.
 * Tra nhanh, không cần gõ dấu.
 *
 * Tìm không thấy thì nhấn Enter hoặc bấm nút để AI tra. AI nhận ra câu tra là cách gọi khác
 * của mục đã có thì mở mục đó; chủ điểm thật sự mới thì soạn nháp và HỎI người học có thêm
 * vào thư viện chung không. Không gọi AI khi đang gõ: "hien ta" chưa xong mà gọi là tốn lượt.
 */
export default function NguPhapTra({ active, dich = null }) {
    const { isLoggedIn } = useAuth();
    const [q, setQ] = useState('');
    const [nhomChon, setNhomChon] = useState('');
    const [data, setData] = useState(null);
    const [mo, setMo] = useState('');
    const [dangHoi, setDangHoi] = useState(false);
    const [dangThem, setDangThem] = useState('');
    const [dangLuu, setDangLuu] = useState(false);
    const [bao, setBao] = useState('');
    const [nhap, setNhap] = useState(null);
    const lanTra = useRef(0);
    const khung = useRef(null);
    const oTim = useRef(null);
    const cuonDen = useRef('');

    // Được mở từ một lỗi hoặc một câu sai: đưa thẳng tới đúng mục, không bắt người học tìm.
    useEffect(() => {
        if (!dich?.lan) return;
        setQ(dich.q || '');
        setNhomChon(dich.nhom || '');
        setMo(dich.id || '');
        cuonDen.current = dich.id || '';
        if (!dich.id && !dich.nhom) oTim.current?.focus();
    }, [dich]);

    useEffect(() => {
        if (!active || !isLoggedIn) return undefined;
        const t = setTimeout(() => {
            // Gõ nhanh: phản hồi của lần tra cũ về sau không được đè kết quả mới.
            lanTra.current += 1;
            const lan = lanTra.current;
            NguPhapAPI.tim(q.trim())
                .then((d) => { if (lan === lanTra.current) setData(d); })
                .catch((e) => { if (lan === lanTra.current) Notification.error(e.message); });
        }, CHO_GO_MS);
        return () => clearTimeout(t);
    }, [active, isLoggedIn, q]);

    // Đổi câu tra: thông báo và bản nháp của câu cũ không còn liên quan.
    useEffect(() => { setBao(''); setNhap(null); }, [q]);

    useEffect(() => {
        if (!cuonDen.current || !data) return;
        const el = khung.current?.querySelector(`[data-np-id="${CSS.escape(cuonDen.current)}"]`);
        if (el) {
            el.scrollIntoView({ block: 'start' });
            cuonDen.current = '';
        }
    }, [data, mo]);

    const tatCa = data?.muc || [];
    const muc = tatCa.filter((m) => !nhomChon || m.nhom === nhomChon);
    const conLuot = data?.conLuot ?? 0;
    const cauTra = q.trim();

    /** Đưa một mục lên đầu danh sách và mở nó. */
    const moMuc = (m, luot) => {
        setNhomChon('');
        setMo(m.id);
        setData((d) => ({
            ...d,
            conLuot: luot ?? d?.conLuot,
            muc: [m, ...(d?.muc || []).filter((x) => x.id !== m.id)],
        }));
    };

    const hoiAI = async () => {
        if (dangHoi || cauTra.length < 2) return;
        setDangHoi(true);
        setBao('');
        setNhap(null);
        try {
            const r = await NguPhapAPI.hoi(cauTra);
            if (r.ketQua === 'da-co') {
                setBao(`"${cauTra}" chính là chủ điểm "${r.muc.ten}" đã có trong thư viện.`);
                moMuc(r.muc, r.conLuot);
            } else if (r.ketQua === 'ban-nhap') {
                setNhap(r.nhap);
                setData((d) => ({ ...d, conLuot: r.conLuot }));
            } else {
                setBao('Đây có vẻ không phải chủ điểm ngữ pháp tiếng Anh. Hãy thử gõ cụ thể hơn.');
                setData((d) => ({ ...d, conLuot: r.conLuot }));
            }
        } catch (e) {
            setBao(e.message);
        } finally {
            setDangHoi(false);
        }
    };

    /** Enter: có mục đúng tên thì mở; chỉ khớp tình cờ trong nội dung hoặc không có thì để AI tra. */
    const guiTim = async (e) => {
        e.preventDefault();
        if (!cauTra || dangHoi) return;
        // Enter ngay sau khi gõ: kết quả trên màn có thể là của câu tra trước.
        let ds = tatCa;
        try {
            lanTra.current += 1;
            const moi = await NguPhapAPI.tim(cauTra);
            setData(moi);
            ds = moi.muc;
        } catch { /* giữ kết quả đang có */ }
        const dungTen = ds.find((m) => m.khopTen);
        if (dungTen) setMo(dungTen.id);
        else hoiAI();
    };

    const themVaoThuVien = async () => {
        if (!nhap || dangLuu) return;
        setDangLuu(true);
        try {
            const r = await NguPhapAPI.themVaoThuVien(nhap.id);
            setNhap(null);
            setBao(r.daCo ? `Chủ điểm "${r.muc.ten}" vừa được thêm trước đó, mình mở mục đó cho bạn.` : `Đã thêm "${r.muc.ten}" vào thư viện.`);
            moMuc(r.muc, r.conLuot);
        } catch (e) {
            setBao(e.message);
        } finally {
            setDangLuu(false);
        }
    };

    const themViDu = async (m) => {
        if (dangThem) return;
        setDangThem(m.id);
        try {
            const r = await NguPhapAPI.themViDu(m.id);
            if (r.daDu) Notification.info('Mục này đã đủ ví dụ.');
            setData((d) => ({
                ...d,
                conLuot: r.conLuot,
                muc: d.muc.map((x) => (x.id === m.id ? { ...x, viDuThem: r.viDuThem } : x)),
            }));
        } catch (e) {
            Notification.error(e.message);
        } finally {
            setDangThem('');
        }
    };

    return (
            <div className="px-wrap" ref={khung}>
                {!isLoggedIn && <p className="px-mo-ta">Đăng nhập để tra cứu công thức ngữ pháp.</p>}

                {isLoggedIn && (
                    <>
                        <form className="np-tim" onSubmit={guiTim}>
                            <i className="fas fa-magnifying-glass"></i>
                            <input
                                ref={oTim}
                                value={q}
                                maxLength={80}
                                autoComplete="off"
                                aria-label="Tìm công thức ngữ pháp"
                                placeholder="Tìm: hien tai don, bị động, used to…"
                                onChange={(e) => setQ(e.target.value)}
                            />
                            {q && (
                                <button type="button" className="np-xoa" aria-label="Xoá nội dung tìm" onClick={() => setQ('')}>
                                    <i className="fas fa-xmark"></i>
                                </button>
                            )}
                        </form>

                        <div className="np-nhom">
                            <button type="button" className={!nhomChon ? 'is-chon' : ''} onClick={() => setNhomChon('')}>Tất cả</button>
                            {data?.nhom?.map((n) => (
                                <button key={n.key} type="button" className={nhomChon === n.key ? 'is-chon' : ''} onClick={() => setNhomChon(n.key)}>
                                    {n.ten}
                                </button>
                            ))}
                        </div>

                        {!data && <p className="px-mo-ta"><i className="fas fa-spinner fa-spin"></i> Đang tải…</p>}
                        {bao && <p className="np-bao" role="status">{bao}</p>}

                        {nhap && (
                            <section className="np-nhap" aria-label="Bản nháp do AI soạn">
                                <p className="np-nhap-hoi">
                                    Chưa có trong thư viện. AI đã soạn mục <strong>{nhap.ten}</strong> cho bạn. Có thêm vào thư viện để lần sau tra được ngay không?
                                </p>
                                <div className="px-nut">
                                    <button type="button" className="btn btn-primary" disabled={dangLuu} onClick={themVaoThuVien}>
                                        <i className="fas fa-plus"></i> {dangLuu ? 'Đang thêm…' : 'Thêm vào thư viện'}
                                    </button>
                                    <button type="button" className="btn btn-secondary" disabled={dangLuu} onClick={() => setNhap(null)}>Không thêm</button>
                                </div>
                                <div className="np-than np-nhap-than">
                                    <h3>{nhap.ten} <span className="np-nhan-ai"><i className="fas fa-wand-magic-sparkles"></i> AI tạo</span></h3>
                                    <NoiDungMuc m={nhap} />
                                </div>
                            </section>
                        )}

                        {data && !muc.length && !nhap && <p className="px-mo-ta">{cauTra ? 'Không tìm thấy mục phù hợp trong thư viện.' : 'Nhóm này chưa có mục nào.'}</p>}

                        <div className="np-ds">
                            {muc.map((m) => (
                                <TheMuc
                                    key={m.id}
                                    m={m}
                                    mo={mo === m.id}
                                    onDoi={() => setMo((x) => (x === m.id ? '' : m.id))}
                                    onThemViDu={() => themViDu(m)}
                                    dangThem={dangThem === m.id}
                                    hetLuot={conLuot <= 0}
                                />
                            ))}
                        </div>

                        {data && cauTra.length >= 2 && !nhap && (
                            <div className="np-hoi">
                                <p>{tatCa.some((m) => m.khopTen) ? 'Chưa đúng điều bạn cần?' : `Chưa thấy mục đúng tên. Nhấn Enter hoặc bấm nút để AI tra "${cauTra}".`}</p>
                                <button type="button" className="btn btn-primary" disabled={dangHoi || conLuot <= 0} onClick={hoiAI}>
                                    <i className="fas fa-wand-magic-sparkles"></i> {dangHoi ? 'AI đang tra…' : 'Tra bằng AI'}
                                </button>
                            </div>
                        )}

                        {data && <p className="px-goi-y">Còn {conLuot} lượt AI hôm nay. Nội dung đã có thì lấy lại miễn phí.</p>}
                    </>
                )}
            </div>
    );
}
