/**
 * Khối "Loại bài" của các chế độ AI (Đọc hiểu, Viết, Dịch, Nghe): "Ngẫu nhiên",
 * ô tự nhập, rồi kho dạng bài chia nhóm dạng chip.
 *
 * Đặt trong `.ai-setup-col` ở cột trái. Mọi màn dùng component này để cách chọn
 * dạng bài trông và hoạt động giống nhau.
 *
 * Nhóm HỢP với kiểu chấm đang chọn xếp lên đầu và có nhãn "hợp …" — gợi ý chứ
 * không khoá: mọi dạng đều chọn được với mọi kiểu chấm.
 *
 * @param {Array<{key,label,hop:string[],dang:Array<{key,label}>}>} nhom  kho dạng bài
 * @param {string}   [kieu]        khoá kiểu chấm đang chọn (để xếp nhóm hợp lên đầu)
 * @param {string}   [kieuLabel]   nhãn kiểu chấm, hiện trong nhãn "hợp …"
 * @param {string}   dang          khoá dạng đang chọn; '' = ngẫu nhiên
 * @param {Function} onDang        (key) => void
 * @param {string}   tuChon        chuỗi tự nhập (ưu tiên hơn `dang`)
 * @param {Function} onTuChon      (text) => void
 * @param {number}   [maxLength]   khớp MAX_TU_CHON ở server
 * @param {string}   [placeholder]
 */
export const MAX_TU_CHON = 60;

export default function ChonDangBai({
    nhom,
    kieu = '',
    kieuLabel = '',
    dang,
    onDang,
    tuChon,
    onTuChon,
    maxLength = MAX_TU_CHON,
    placeholder = 'Hoặc tự nhập dạng bài / chủ đề…',
}) {
    const tuNhap = tuChon.trim();
    const tatCa = nhom.flatMap((n) => n.hop);
    // Nhóm hợp mọi kiểu thì không cần nhãn "hợp …" — nó không phân biệt được gì.
    const hopTatCa = (n) => new Set(tatCa).size === new Set(n.hop).size;
    const nhomXep = [...nhom].sort((a, b) =>
        Number(b.hop.includes(kieu)) - Number(a.hop.includes(kieu)));

    return (
        <>
            <div className="ai-setup-title">Loại bài</div>
            <div className="rd-chips">
                <button
                    className={`rd-chip${!tuNhap && !dang ? ' is-on' : ''}`}
                    onClick={() => { onDang(''); onTuChon(''); }}
                >
                    <i className="fas fa-shuffle"></i> Ngẫu nhiên
                </button>
            </div>
            <input
                className={`rd-custom${tuNhap ? ' is-on' : ''}`}
                type="text"
                maxLength={maxLength}
                value={tuChon}
                onChange={(e) => onTuChon(e.target.value)}
                placeholder={placeholder}
            />
            {nhomXep.map((n) => (
                <div key={n.key} className="rd-group">
                    <div className="rd-group-title">
                        {n.label}
                        {kieu && n.hop.includes(kieu) && !hopTatCa(n) && (
                            <span className="rd-group-tag">hợp {kieuLabel || kieu}</span>
                        )}
                    </div>
                    <div className="rd-chips">
                        {n.dang.map((d) => (
                            <button
                                key={d.key}
                                className={`rd-chip${!tuNhap && dang === d.key ? ' is-on' : ''}`}
                                onClick={() => { onDang(d.key); onTuChon(''); }}
                            >
                                {d.label}
                            </button>
                        ))}
                    </div>
                </div>
            ))}
        </>
    );
}
