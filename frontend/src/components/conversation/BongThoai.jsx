import { useEffect, useRef, useState } from 'react';

/** Mấy vạch sóng âm trang trí — giống tin nhắn thoại của các ứng dụng chat. */
function SongAm({ dangPhat }) {
    return (
        <span className={`convo-thoai-song${dangPhat ? ' is-phat' : ''}`} aria-hidden="true">
            {[6, 12, 9, 16, 7, 13, 10, 15, 8, 11, 6, 14].map((h, i) => (
                <i key={i} style={{ height: `${h}px` }} />
            ))}
        </span>
    );
}

/**
 * Tin nhắn thoại của AI: CHỈ có nút phát, không có chữ — người học phải nghe hiểu.
 * Âm thanh do màn hình phát (TTS qua `GameLogic.speakWord`), bong bóng chỉ hiển thị
 * trạng thái và báo bấm.
 */
export function BongThoaiAI({ dangPhat, onBam }) {
    return (
        <button
            type="button"
            className={`convo-thoai convo-thoai--ai${dangPhat ? ' is-phat' : ''}`}
            onClick={onBam}
            title={dangPhat ? 'Dừng' : 'Nghe tin nhắn thoại'}
        >
            <span className="convo-thoai-nut"><i className={`fas ${dangPhat ? 'fa-pause' : 'fa-play'}`}></i></span>
            <SongAm dangPhat={dangPhat} />
        </button>
    );
}

/** Tin nhắn thoại của người học: phát lại chính bản ghi âm của mình. */
export function BongThoaiCuaToi({ url }) {
    const audio = useRef(null);
    const [dangPhat, setDangPhat] = useState(false);

    useEffect(() => () => { try { audio.current?.pause(); } catch { /* đã gỡ */ } }, []);

    const bam = () => {
        if (!audio.current) {
            audio.current = new Audio(url);
            audio.current.onended = () => setDangPhat(false);
            audio.current.onerror = () => setDangPhat(false);
        }
        if (dangPhat) {
            audio.current.pause();
            setDangPhat(false);
        } else {
            audio.current.currentTime = 0;
            audio.current.play().then(() => setDangPhat(true)).catch(() => setDangPhat(false));
        }
    };

    return (
        <button
            type="button"
            className={`convo-thoai convo-thoai--toi${dangPhat ? ' is-phat' : ''}`}
            onClick={bam}
            title={dangPhat ? 'Dừng' : 'Nghe lại giọng của bạn'}
        >
            <span className="convo-thoai-nut"><i className={`fas ${dangPhat ? 'fa-pause' : 'fa-play'}`}></i></span>
            <SongAm dangPhat={dangPhat} />
        </button>
    );
}
