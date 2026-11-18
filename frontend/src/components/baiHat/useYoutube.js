import { useEffect, useRef, useState } from 'react';

/**
 * Trình phát YouTube nhúng, điều khiển qua IFrame API chính thức để đọc thời điểm đang phát
 * (lời chạy theo nhạc) và tua/dừng/phát. Dùng bản youtube-nocookie: không đặt cookie theo dõi
 * trước khi bấm phát.
 *
 * Tách riêng file để test màn hình thay được trình phát giả (jsdom không chạy được YouTube).
 */
let napApi = null;
function napYoutube() {
    if (window.YT?.Player) return Promise.resolve(window.YT);
    if (!napApi) {
        napApi = new Promise((xong, hong) => {
            const cu = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = () => { cu?.(); xong(window.YT); };
            const s = document.createElement('script');
            s.src = 'https://www.youtube.com/iframe_api';
            s.async = true;
            s.onerror = () => { napApi = null; hong(new Error('Không tải được trình phát YouTube.')); };
            document.head.appendChild(s);
        });
    }
    return napApi;
}

/** Thông báo theo mã lỗi của trình phát YouTube (thuần). */
export function loiYoutube(ma) {
    if (ma === 101 || ma === 150) return 'Chủ video không cho phát nhúng. Tìm bản khác của cùng bài (lyric video, bản audio) rồi thêm lại.';
    if (ma === 100) return 'Video không còn tồn tại hoặc đã bị ẩn.';
    if (ma === 2) return 'Link video không hợp lệ.';
    if (ma === 153) return 'Trình phát YouTube không nhận được địa chỉ trang (referrer). Thử tải lại trang.';
    return `Không phát được video (mã ${ma ?? '?'}). Thử tải lại trang hoặc dùng link khác của cùng bài.`;
}

/** `khung`: ref tới thẻ div sẽ được thay bằng iframe. */
export function useYoutube(khung, videoId) {
    const may = useRef(null);
    const [san, setSan] = useState(false);
    const [dangPhat, setDangPhat] = useState(false);
    const [loi, setLoi] = useState('');

    useEffect(() => {
        if (!videoId || !khung.current) return undefined;
        let huy = false;
        setSan(false);
        setLoi('');
        napYoutube().then((YT) => {
            if (huy || !khung.current) return;
            const div = document.createElement('div');
            khung.current.innerHTML = '';
            khung.current.appendChild(div);
            may.current = new YT.Player(div, {
                videoId,
                host: 'https://www.youtube-nocookie.com',
                playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
                events: {
                    onReady: () => { if (!huy) setSan(true); },
                    onStateChange: (e) => { if (!huy) setDangPhat(e.data === YT.PlayerState.PLAYING); },
                    onError: (e) => { if (!huy) setLoi(loiYoutube(e?.data)); },
                },
            });
        }).catch((e) => { if (!huy) setLoi(e.message); });
        return () => {
            huy = true;
            try { may.current?.destroy?.(); } catch { /* đã gỡ */ }
            may.current = null;
            setDangPhat(false);
        };
    }, [videoId, khung]);

    const p = () => may.current;
    return {
        san, dangPhat, loi,
        gio: () => Number(p()?.getCurrentTime?.()) || 0,
        phat: () => p()?.playVideo?.(),
        dung: () => p()?.pauseVideo?.(),
        tua: (t) => p()?.seekTo?.(Math.max(0, t), true),
        tocDo: (r) => p()?.setPlaybackRate?.(r),
    };
}
