import { useCallback, useEffect, useRef, useState } from 'react';
import { createSpeechInput } from '@lib/speechInput.js';

/** Ghi âm tối đa (giây) — một câu trả lời hội thoại không cần dài hơn. */
const TOI_DA_GIAY = 60;
/** Chờ thêm sau khi dừng để bộ nhận dạng gửi nốt phần chữ cuối (đến trễ sau `stop`). */
const CHO_CHU_CUOI_MS = 700;

/**
 * Ghi âm câu trả lời cho Hội thoại giọng nói — CHẠY SONG SONG hai thứ:
 *   · MediaRecorder: giữ lại GIỌNG của người học để nghe lại (tin nhắn thoại).
 *   · Web Speech (nhận dạng): ra CHỮ để server chấm từ mục tiêu như Chat.
 *
 * Không xin được micro cho MediaRecorder (trình duyệt chặn) thì vẫn nhận dạng
 * chữ — chỉ mất phần nghe lại. Trạng thái: 'nghi' → 'ghi' → 'xong'.
 *
 * Object URL của bản ghi được thu hồi khi rời màn (không thu hồi ngay sau khi
 * gửi: bong bóng thoại đã gửi vẫn đang dùng nó để phát lại).
 */
export function useGhiAm(lang) {
    const [trangThai, setTrangThai] = useState('nghi');
    const [chu, setChu] = useState('');
    const [url, setUrl] = useState('');
    const [giay, setGiay] = useState(0);
    const [loi, setLoi] = useState('');

    const r = useRef({ speech: null, rec: null, stream: null, timer: null, urls: [] });

    const donDep = useCallback(() => {
        const x = r.current;
        clearInterval(x.timer);
        x.timer = null;
        try { x.speech?.destroy(); } catch { /* đã huỷ */ }
        x.speech = null;
        try { if (x.rec?.state === 'recording') x.rec.stop(); } catch { /* đã dừng */ }
        x.stream?.getTracks?.().forEach((t) => t.stop());
        x.stream = null;
    }, []);

    const dung = useCallback(() => {
        const x = r.current;
        if (!x.speech && !x.rec) return;
        clearInterval(x.timer);
        x.timer = null;
        try { x.speech?.stop(); } catch { /* đã dừng */ }
        try { if (x.rec?.state === 'recording') x.rec.stop(); } catch { /* đã dừng */ }
        setTimeout(() => {
            try { x.speech?.destroy(); } catch { /* đã huỷ */ }
            x.speech = null;
            setTrangThai('xong');
        }, CHO_CHU_CUOI_MS);
    }, []);

    const batDau = useCallback(async () => {
        donDep();
        setLoi('');
        setChu('');
        setUrl('');
        setGiay(0);
        const x = r.current;

        x.speech = createSpeechInput({
            lang,
            onText: (t) => setChu(t),
            onError: (code) => setLoi(code === 'not-allowed'
                ? 'Bạn chưa cho phép dùng micro — bật quyền micro cho trang này rồi thử lại.'
                : 'Không nhận được giọng nói, hãy thử lại.'),
        });
        x.speech.start();

        try {
            x.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const rec = new MediaRecorder(x.stream);
            const manh = [];
            rec.ondataavailable = (e) => { if (e.data?.size) manh.push(e.data); };
            rec.onstop = () => {
                if (manh.length) {
                    const u = URL.createObjectURL(new Blob(manh, { type: rec.mimeType || 'audio/webm' }));
                    x.urls.push(u);
                    setUrl(u);
                }
                x.stream?.getTracks?.().forEach((t) => t.stop());
                x.stream = null;
            };
            rec.start();
            x.rec = rec;
        } catch {
            // Không ghi được giọng (không có MediaRecorder / bị chặn): vẫn nhận dạng chữ.
            x.rec = null;
        }

        setTrangThai('ghi');
        x.timer = setInterval(() => {
            setGiay((s) => {
                if (s + 1 >= TOI_DA_GIAY) dung();
                return s + 1;
            });
        }, 1000);
    }, [lang, donDep, dung]);

    /** Bỏ bản vừa ghi để ghi lại (bản này chưa gửi nên thu hồi luôn URL). */
    const lamLai = useCallback(() => {
        donDep();
        setUrl((u) => {
            if (u) {
                URL.revokeObjectURL(u);
                r.current.urls = r.current.urls.filter((x) => x !== u);
            }
            return '';
        });
        setChu('');
        setGiay(0);
        setLoi('');
        setTrangThai('nghi');
    }, [donDep]);

    /** Đã gửi: về trạng thái nghỉ, GIỮ URL (bong bóng đã gửi còn phát lại). */
    const xongGui = useCallback(() => {
        donDep();
        setUrl('');
        setChu('');
        setGiay(0);
        setTrangThai('nghi');
    }, [donDep]);

    useEffect(() => () => {
        donDep();
        r.current.urls.forEach((u) => URL.revokeObjectURL(u));
        r.current.urls = [];
    }, [donDep]);

    return { trangThai, chu, url, giay, loi, batDau, dung, lamLai, xongGui };
}
