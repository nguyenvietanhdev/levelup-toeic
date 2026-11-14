import { useEffect, useState } from 'react';
import { GameLogic } from '@game/gameLogic.js';
import { luuMauCau } from '@lib/luuMauCau.js';

/** Đọc cả câu bằng giọng đúng ngôn ngữ. */
export function phatCau(text, lang) {
    if (!text) return;
    try {
        GameLogic.stopSpeaking?.();
        GameLogic.speakWord(text, lang === 'zh' ? 'zh-CN' : 'en-US');
    } catch { /* không đọc được thì thôi */ }
}

/**
 * Hai nút đi cùng một câu ngữ pháp: nghe cả câu, và lưu câu vào Từ vựng riêng (kho Mẫu câu).
 * Dùng chung cho màn luyện và lịch sử.
 */
export default function NutMauCau({ cau, nghia, lang, tenMuc, nho = false }) {
    const [luu, setLuu] = useState(''); // '' | 'dang' | 'xong' | thông báo lỗi
    useEffect(() => { setLuu(''); }, [cau]);
    if (!cau) return null;

    const luuCau = async () => {
        if (luu === 'dang' || luu === 'xong') return;
        setLuu('dang');
        try {
            await luuMauCau({ cau, nghia, lang, tenMuc });
            setLuu('xong');
        } catch (e) {
            setLuu(e.message);
        }
    };

    const lop = `btn btn-secondary${nho ? ' btn-sm' : ''}`;
    return (
        <>
            <button type="button" className={lop} aria-label={`Nghe cả câu: ${cau}`} onClick={() => phatCau(cau, lang)}>
                <i className="fas fa-volume-high"></i> Nghe cả câu
            </button>
            <button type="button" className={lop} disabled={luu === 'dang' || luu === 'xong'} onClick={luuCau}
                title="Lưu câu này vào Từ vựng riêng, kho Mẫu câu">
                <i className={`fas ${luu === 'xong' ? 'fa-check' : 'fa-bookmark'}`}></i> {luu === 'xong' ? 'Đã lưu mẫu câu' : 'Lưu mẫu câu'}
            </button>
            {luu && luu !== 'dang' && luu !== 'xong' && <span className="px-goi-y" role="alert">{luu}</span>}
        </>
    );
}
