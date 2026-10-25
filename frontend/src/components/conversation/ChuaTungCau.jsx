import { dinhViLoi, chiaManh, nhanLoai } from '@lib/chuaBai.js';

/**
 * CHỮA TỪNG CÂU sau khi kết thúc hội thoại: mỗi câu người học nói có lỗi hiện thành
 * một thẻ — chỗ sai gạch đỏ, cách nói đúng chèn xanh ngay tại chỗ, kèm lời giải thích.
 *
 * Giữa phiên AI không sửa (để giữ mạch nói); phần chữa chỉ đến sau khi chấm. Mỗi mục
 * có `luot` = thứ tự trong các lượt của người học (server đã kiểm trích dẫn có thật).
 *
 * @param {object[]} turns        toàn bộ lượt `{ role, content }`
 * @param {object[]} corrections  `{ luot, said, better, issue, loai, muc }`
 */
export default function ChuaTungCau({ turns, corrections }) {
    const ds = Array.isArray(corrections) ? corrections : [];
    if (!ds.length) return null;
    const cauHoc = (turns || []).filter((t) => t.role === 'user').map((t) => t.content);

    // Gom theo lượt, giữ thứ tự hội thoại.
    const theoLuot = new Map();
    for (const c of ds) {
        if (!cauHoc[c.luot]) continue;
        if (!theoLuot.has(c.luot)) theoLuot.set(c.luot, []);
        theoLuot.get(c.luot).push(c);
    }
    const luot = [...theoLuot.keys()].sort((a, b) => a - b);
    if (!luot.length) return null;

    return (
        <div className="ctc-wrap">
            <div className="ctc-tieu-de"><i className="fas fa-marker"></i> Chữa từng câu</div>
            {luot.map((l) => {
                const cau = cauHoc[l];
                const loi = theoLuot.get(l).map((c, i) => ({ ...c, id: `${l}-${i}`, quote: c.said }));
                const { doan } = dinhViLoi(cau, loi);
                const manh = chiaManh(cau, doan);
                return (
                    <div key={l} className="ctc-cau">
                        <div className="ctc-ban">Câu {l + 1} của bạn</div>
                        <p className="ctc-noi">
                            {manh.map((m, i) => (m.loi ? (
                                <span key={i}>
                                    <del className="cb-bo">{m.chu}</del>
                                    {m.loi.better && <ins className="cb-them">{m.loi.better}</ins>}
                                </span>
                            ) : <span key={i}>{m.chu}</span>))}
                        </p>
                        <ul className="ctc-giai-thich">
                            {loi.map((c) => (
                                <li key={c.id}>
                                    <span className={`cb-nhan is-${c.muc}`}>{c.muc === 'loi' ? 'Lỗi' : 'Tự nhiên hơn'} · {nhanLoai(c.loai)}</span>
                                    <span>“{c.said}”{c.better ? <> → <strong>“{c.better}”</strong></> : null}: {c.issue}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                );
            })}
            <p className="ctc-chan">Các câu này cũng được ghi vào <strong>Sổ tay lỗi</strong> (Tiến bộ của tôi).</p>
        </div>
    );
}
