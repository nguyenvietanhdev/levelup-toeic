import { useEffect, useRef, useState } from 'react';
import { BaiNhapAPI } from '@api/baiNhap.js';

/**
 * BÀI LÀM DỞ (Viết / Dịch / Đọc / Nghe): đề đã lấy được server lưu ngay lúc sinh;
 * phần đã làm tự lưu.
 * Vào lại màn mà chưa có đề → hỏi "Làm tiếp?" thay vì gọi AI lấy đề mới.
 */
const CHO_LUU_MS = 1500;

/**
 * @param {'viet'|'dich'|'doc'|'nghe'} mode
 * @param {object} o
 * @param {boolean} o.active   màn đang mở
 * @param {boolean} o.coDe     đang có đề trên màn (đang làm bài)
 * @param {boolean} o.xong     đã nộp chấm (server đã xoá nháp — thôi lưu)
 * @param {string}  o.noiDung  phần đang gõ
 * @param {string}  o.deBai    đề / đoạn văn đang hiện (server so với đề của bài nháp)
 */
export function useBaiNhap(mode, { active, coDe, xong, noiDung, deBai }) {
    const [nhap, setNhap] = useState(null);
    const daLuu = useRef(noiDung);

    // Mở màn khi chưa có đề → xem có bài làm dở không.
    useEffect(() => {
        if (!active || coDe) return undefined;
        let huy = false;
        BaiNhapAPI.get(mode)
            .then((d) => { if (!huy) setNhap(d?.de ? d : null); })
            .catch(() => { /* phần thêm: lỗi thì vẫn lấy đề mới được như cũ */ });
        return () => { huy = true; };
    }, [active, coDe, mode]);

    // Đang làm thì tự lưu phần gõ — chờ ngừng gõ một chút để không gọi mỗi phím.
    useEffect(() => {
        if (!coDe || xong || !deBai || noiDung === daLuu.current) return undefined;
        const t = setTimeout(() => {
            daLuu.current = noiDung;
            BaiNhapAPI.luu(mode, noiDung, deBai).catch(() => { /* lần gõ sau sẽ lưu lại */ });
        }, CHO_LUU_MS);
        return () => clearTimeout(t);
    }, [coDe, xong, noiDung, deBai, mode]);

    return {
        nhap,
        /** Đã nhận bài làm dở vào màn — ẩn thẻ, và coi phần gõ hiện có là đã lưu. */
        daDung: () => { daLuu.current = nhap?.noiDung || ''; setNhap(null); },
        /** Bỏ bài làm dở. */
        boQua: () => { setNhap(null); BaiNhapAPI.xoa(mode).catch(() => {}); },
    };
}

const soChu = (s, lang) => {
    const t = String(s || '').trim();
    if (!t) return 0;
    return lang === 'zh' ? t.replace(/\s/g, '').length : t.split(/\s+/).length;
};

const luc = (d) => {
    const t = new Date(d);
    if (Number.isNaN(t.getTime())) return '';
    return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')} ${String(t.getDate()).padStart(2, '0')}/${String(t.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * Thẻ "Bạn còn một bài làm dở" ở màn chọn đề.
 * `moTa` thay dòng "Đã viết N từ" (vd Đọc: "Đã chọn 2/4 câu").
 */
export function TheBaiDo({ nhap, deBai, moTa, onLamTiep, onBo }) {
    if (!nhap) return null;
    const lang = nhap.de?.lang === 'zh' ? 'zh' : 'en';
    const n = soChu(nhap.noiDung, lang);
    return (
        <div className="bai-do" role="status">
            <div className="bai-do-dau"><i className="fas fa-file-pen"></i> Bạn còn một bài làm dở</div>
            <p className="bai-do-de">{String(deBai || '').slice(0, 220)}{String(deBai || '').length > 220 ? '…' : ''}</p>
            <div className="bai-do-chan">
                <span>
                    {moTa ?? (n > 0 ? `Đã viết ${n} ${lang === 'zh' ? 'chữ' : 'từ'}` : 'Chưa viết gì')}
                    {nhap.capNhat ? ` · lưu lúc ${luc(nhap.capNhat)}` : ''}
                </span>
                <div className="bai-do-nut">
                    <button type="button" className="btn btn-secondary" onClick={onBo}>Bỏ, lấy đề mới</button>
                    <button type="button" className="btn btn-primary" onClick={onLamTiep}>
                        <i className="fas fa-play"></i> Làm tiếp
                    </button>
                </div>
            </div>
        </div>
    );
}
