// Nhập bằng giọng nói qua Web Speech API.
//
// Ba điều bất ngờ của API này, và cách xử lý:
//
// 1. TRÌNH DUYỆT TỰ NGẮT KHI IM LẶNG. Dù đặt `continuous = true`, Chrome vẫn bắn
//    `onend` sau vài giây không nghe thấy gì. Người dùng đang giữ nút mà máy đã
//    ngừng nghe từ lúc nào không biết. Nên phải TỰ BẬT LẠI chừng nào còn ở trạng
//    thái muốn nghe (`wantActive`).
//
// 2. KẾT QUẢ ĐẾN THEO TỪNG MẢNH. Mỗi lần `onresult` trả về CẢ danh sách từ đầu
//    phiên, gồm phần đã chốt (`isFinal`) và phần đang đoán. Ghép sai là chữ nhân
//    đôi. Ở đây gom riêng: phần đã chốt cộng dồn, phần đang đoán chỉ để hiển thị.
//
// 3. KHÔNG PHẢI TRÌNH DUYỆT NÀO CŨNG CÓ. Firefox không hỗ trợ. Phải kiểm trước
//    rồi ẩn nút đi, thay vì để người dùng bấm vào một nút không làm gì.
//
// Ngoài ra API yêu cầu HTTPS (localhost được miễn) và quyền micro của trình duyệt.

const Recognition =
    typeof window !== 'undefined'
        ? window.SpeechRecognition || window.webkitSpeechRecognition
        : undefined;

/** Trình duyệt này có nhận giọng nói không. Gọi trước khi vẽ nút micro. */
export function isSpeechSupported() {
    return !!Recognition;
}

/** Mã ngôn ngữ cho bộ nhận dạng, theo ngôn ngữ từ vựng đang chọn. */
export function speechLangFor(vocabLang) {
    return vocabLang === 'zh' ? 'zh-CN' : 'en-US';
}

/**
 * Tạo một phiên nhập giọng nói.
 *
 * @param {object} opts
 *   lang        mã ngôn ngữ, vd 'en-US'
 *   onText      (text, isFinal) — text là TOÀN BỘ nội dung nghe được tới lúc này
 *   onStateChange (listening: boolean)
 *   onError     (code: string) — 'not-allowed' khi người dùng từ chối quyền micro
 * @returns {{start: Function, stop: Function, isListening: Function, destroy: Function}}
 */
export function createSpeechInput({ lang = 'en-US', onText, onStateChange, onError } = {}) {
    if (!Recognition) {
        return {
            start: () => {}, stop: () => {},
            isListening: () => false, destroy: () => {},
        };
    }

    let rec = null;
    let wantActive = false;   // người dùng CÓ muốn nghe không (khác với máy có đang nghe không)
    let finalText = '';       // phần đã chốt, cộng dồn qua các lần tự bật lại
    let destroyed = false;

    function build() {
        const r = new Recognition();
        r.lang = lang;
        r.continuous = true;
        r.interimResults = true;

        r.onresult = (e) => {
            let interim = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
                const chunk = e.results[i][0].transcript;
                if (e.results[i].isFinal) finalText += chunk;
                else interim += chunk;
            }
            const full = (finalText + interim).trim();
            onText?.(full, interim === '');
        };

        r.onerror = (e) => {
            // 'no-speech' và 'aborted' là chuyện thường khi im lặng hoặc tự bật lại —
            // không phải lỗi để báo cho người dùng.
            if (e.error === 'no-speech' || e.error === 'aborted') return;
            wantActive = false;
            onStateChange?.(false);
            onError?.(e.error);
        };

        r.onend = () => {
            // Tự bật lại nếu người dùng vẫn đang muốn nghe (xem ghi chú 1 ở đầu file).
            if (wantActive && !destroyed) {
                try { r.start(); return; } catch { /* đang chạy rồi thì thôi */ }
            }
            onStateChange?.(false);
        };

        return r;
    }

    return {
        start() {
            if (destroyed || wantActive) return;
            wantActive = true;
            finalText = '';
            rec = rec || build();
            try {
                rec.start();
                onStateChange?.(true);
            } catch {
                // start() ném lỗi nếu phiên trước chưa kịp đóng — coi như đã bật.
                onStateChange?.(true);
            }
        },

        stop() {
            if (!wantActive) return;
            wantActive = false;      // đặt TRƯỚC khi stop, không thì onend lại tự bật lại
            try { rec?.stop(); } catch { /* chưa chạy */ }
            onStateChange?.(false);
        },

        isListening: () => wantActive,

        destroy() {
            destroyed = true;
            wantActive = false;
            try { rec?.abort(); } catch { /* nothing */ }
            rec = null;
        },
    };
}
