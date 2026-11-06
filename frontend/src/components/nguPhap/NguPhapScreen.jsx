import { useEffect, useRef, useState } from 'react';
import { useGame } from '@game/GameContext.jsx';
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

/** Một mục ngữ pháp, bấm tiêu đề để mở. */
function TheMuc({ m, mo, onDoi, onThemViDu, dangThem, hetLuot }) {
    return (
        <article className={`np-the ${mo ? 'is-mo' : ''}`}>
            <button type="button" className="np-dau" aria-expanded={mo} onClick={onDoi}>
                <strong>{m.ten}</strong>
                {m.nguon === 'ai' && <span className="np-nhan-ai"><i className="fas fa-wand-magic-sparkles"></i> AI tạo</span>}
                <i className={`fas fa-chevron-${mo ? 'up' : 'down'}`}></i>
            </button>
            {mo && (
                <div className="np-than">
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
 * Công thức ngữ pháp — tra cứu nhanh. Tìm không cần gõ dấu. Kho lõi viết tay nên tra không
 * tốn AI; không có chủ điểm cần tìm thì người học chủ động bấm hỏi AI, không tự gọi.
 */
export default function NguPhapScreen({ active }) {
    const { showScreen } = useGame();
    const { isLoggedIn } = useAuth();
    const [q, setQ] = useState('');
    const [nhomChon, setNhomChon] = useState('');
    const [data, setData] = useState(null);
    const [mo, setMo] = useState('');
    const [dangHoi, setDangHoi] = useState(false);
    const [dangThem, setDangThem] = useState('');
    const [baoHoi, setBaoHoi] = useState('');
    const lanTra = useRef(0);

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

    useEffect(() => { setBaoHoi(''); }, [q]);

    const muc = (data?.muc || []).filter((m) => !nhomChon || m.nhom === nhomChon);
    const conLuot = data?.conLuot ?? 0;
    const cauTra = q.trim();

    const hoiAI = async () => {
        if (dangHoi || !cauTra) return;
        setDangHoi(true);
        setBaoHoi('');
        try {
            const r = await NguPhapAPI.hoi(cauTra);
            if (r.khongPhaiNguPhap) {
                setBaoHoi('Đây có vẻ không phải chủ điểm ngữ pháp tiếng Anh, nên AI chưa tạo mục. Hãy thử gõ cụ thể hơn.');
                setData((d) => ({ ...d, conLuot: r.conLuot }));
                return;
            }
            setNhomChon('');
            setMo(r.muc.id);
            setData((d) => ({
                ...d,
                conLuot: r.conLuot,
                muc: [r.muc, ...(d?.muc || []).filter((x) => x.id !== r.muc.id)],
            }));
        } catch (e) {
            setBaoHoi(e.message);
        } finally {
            setDangHoi(false);
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
        <div id="ngu-phap-screen" className={`screen ${active ? 'active' : ''}`}>
            <div className="screen-header">
                <button className="back-btn-screen icon-btn" onClick={() => showScreen('home-screen')}>
                    <i className="fas fa-arrow-left"></i>
                </button>
                <h2><i className="fas fa-spell-check"></i> Công thức ngữ pháp</h2>
            </div>

            <div className="px-wrap">
                {!isLoggedIn && <p className="px-mo-ta">Đăng nhập để tra cứu công thức ngữ pháp.</p>}

                {isLoggedIn && (
                    <>
                        <div className="np-tim">
                            <i className="fas fa-magnifying-glass"></i>
                            <input
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
                        </div>

                        <div className="np-nhom">
                            <button type="button" className={!nhomChon ? 'is-chon' : ''} onClick={() => setNhomChon('')}>Tất cả</button>
                            {data?.nhom?.map((n) => (
                                <button key={n.key} type="button" className={nhomChon === n.key ? 'is-chon' : ''} onClick={() => setNhomChon(n.key)}>
                                    {n.ten}
                                </button>
                            ))}
                        </div>

                        {!data && <p className="px-mo-ta"><i className="fas fa-spinner fa-spin"></i> Đang tải…</p>}
                        {data && !muc.length && <p className="px-mo-ta">Không tìm thấy mục phù hợp.</p>}

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

                        {data && cauTra.length >= 2 && (
                            <div className="np-hoi">
                                <p>{muc.length ? 'Chưa đúng điều bạn cần?' : `Chưa có mục về "${cauTra}".`}</p>
                                <button type="button" className="btn btn-primary" disabled={dangHoi || conLuot <= 0} onClick={hoiAI}>
                                    <i className="fas fa-wand-magic-sparkles"></i> {dangHoi ? 'AI đang viết…' : 'Hỏi AI về chủ điểm này'}
                                </button>
                                {baoHoi && <p className="px-goi-y">{baoHoi}</p>}
                            </div>
                        )}

                        {data && <p className="px-goi-y">Còn {conLuot} lượt AI hôm nay. Nội dung đã có người tạo thì lấy lại miễn phí.</p>}
                    </>
                )}
            </div>
        </div>
    );
}
