/**
 * Khối "Kiểu chấm" + "Độ khó" của các chế độ AI — cùng một giao diện với Hội thoại.
 *
 * Đặt bên trong một `.ai-setup-col` ở cột phải. Mọi màn dùng component này để
 * kiểu chấm và độ khó trông và hoạt động giống nhau.
 *
 * @param {Array<{key,label,desc}>} kieuList   các kiểu chấm đang áp dụng được
 * @param {string}  kieuDangChon               khoá kiểu chấm đang chọn
 * @param {Function} onKieu                    (key) => void
 * @param {Array<{key,label,desc}>} doKhoList  các mức độ khó
 * @param {string}  doKhoDangChon              khoá mức độ đang chọn
 * @param {Function} onDoKho                   (key) => void
 * @param {ReactNode} [giua]                   nội dung thêm giữa hai khối (vd Ngữ pháp chấm)
 */
export default function KieuChamDoKho({
    kieuList,
    kieuDangChon,
    onKieu,
    doKhoList,
    doKhoDangChon,
    onDoKho,
    giua = null,
}) {
    return (
        <>
            <div className="ai-setup-title">Kiểu chấm</div>
            <div className="ai-setup-list tr-levels">
                {kieuList.map((k) => (
                    <button
                        key={k.key}
                        className={`tr-level${kieuDangChon === k.key ? ' is-on' : ''}`}
                        onClick={() => onKieu(k.key)}
                    >
                        <strong>{k.label}</strong>
                        <em>{k.desc}</em>
                    </button>
                ))}
            </div>

            {giua}

            <div className="ai-setup-title">Độ khó</div>
            <div className="ai-setup-list tr-levels">
                {doKhoList.map((m) => (
                    <button
                        key={m.key}
                        className={`tr-level${doKhoDangChon === m.key ? ' is-on' : ''}`}
                        onClick={() => onDoKho(m.key)}
                    >
                        <strong>{m.label}</strong>
                        <em>{m.desc}</em>
                    </button>
                ))}
            </div>
        </>
    );
}
