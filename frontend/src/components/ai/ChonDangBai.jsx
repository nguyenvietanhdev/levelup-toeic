import { useEffect, useState } from 'react';
import { DangGoiYAPI } from '@api/dangGoiY.js';
import { getVocabLang } from '@api/vocabulary.js';
import { TopicSelector } from '@components/vocab/topic/topicSelector.js';
import { PartSelector } from '@components/vocab/part/partSelector.js';

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
 * @param {string[]} [goiY]        khoá dạng hợp bộ từ của Part (AI gợi ý) — nhóm đầu tiên
 * @param {string}   [tieuDe]      tiêu đề khối (Hội thoại dùng "Tình huống")
 */
export const MAX_TU_CHON = 60;

/**
 * Gợi ý dạng bài hợp bộ từ của Part đang học, cho chế độ `mode`.
 *
 * Đọc lại mỗi khi màn được mở (`active`): đề/Part chọn ở thanh trên không phải
 * state React, nên đổi Part rồi quay lại màn là phải hỏi lại. Server có cache nên
 * chỉ lần đầu của mỗi Part mới tốn một lần gọi AI. Lỗi → không gợi ý, không báo.
 */
export function useGoiYDang(mode, active) {
    const [goiY, setGoiY] = useState([]);
    useEffect(() => {
        if (!active) return undefined;
        const source = TopicSelector.currentTopic?.source || '';
        const part = PartSelector.selectedPart || '';
        if (!source || !part) {
            setGoiY([]);
            return undefined;
        }
        let huy = false;
        DangGoiYAPI.get({ mode, source, part, lang: getVocabLang() })
            .then((keys) => { if (!huy) setGoiY(keys); })
            .catch(() => { if (!huy) setGoiY([]); });
        return () => { huy = true; };
    }, [mode, active]);
    return goiY;
}

/**
 * Dạng gửi lên server lúc bắt đầu: tự nhập thắng; rồi chip đang chọn; còn
 * "Ngẫu nhiên" thì bốc trong các dạng HỢP BỘ TỪ (nếu có gợi ý) — để ngẫu nhiên
 * không ra một dạng ép từ vào bối cảnh lạ. Không có gợi ý thì gửi rỗng như cũ.
 */
export function dangGui({ dang, tuChon, goiY = [] }) {
    const tu = String(tuChon || '').trim();
    if (tu) return { dang: '', tuChon: tu };
    if (dang) return { dang, tuChon: '' };
    if (goiY.length) return { dang: goiY[Math.floor(Math.random() * goiY.length)], tuChon: '' };
    return { dang: '', tuChon: '' };
}

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
    goiY = [],
    tieuDe = 'Loại bài',
}) {
    const tuNhap = tuChon.trim();
    const tatCa = nhom.flatMap((n) => n.hop);
    // Nhóm hợp mọi kiểu thì không cần nhãn "hợp …" — nó không phân biệt được gì.
    const hopTatCa = (n) => new Set(tatCa).size === new Set(n.hop).size;
    const nhomXep = [...nhom].sort((a, b) =>
        Number(b.hop.includes(kieu)) - Number(a.hop.includes(kieu)));
    // Nhóm "Hợp bộ từ này": chỉ những khoá còn trong kho, theo thứ tự AI xếp.
    const tatCaDang = nhom.flatMap((n) => n.dang);
    const dangGoiY = goiY.map((k) => tatCaDang.find((d) => d.key === k)).filter(Boolean);
    const nhomHienThi = dangGoiY.length
        ? [{ key: 'goi-y', label: 'Hợp bộ từ này', hop: [], dang: dangGoiY, goiY: true }, ...nhomXep]
        : nhomXep;

    return (
        <>
            <div className="ai-setup-title">{tieuDe}</div>
            <div className="rd-chips">
                <button
                    className={`rd-chip${!tuNhap && !dang ? ' is-on' : ''}`}
                    onClick={() => { onDang(''); onTuChon(''); }}
                >
                    <i className="fas fa-shuffle"></i> Ngẫu nhiên{dangGoiY.length ? ' (trong nhóm hợp bộ từ)' : ''}
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
            {nhomHienThi.map((n) => (
                <div key={n.key} className={`rd-group${n.goiY ? ' rd-group--goi-y' : ''}`}>
                    <div className="rd-group-title">
                        {n.goiY && <i className="fas fa-wand-magic-sparkles"></i>}
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
