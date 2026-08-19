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

// Mã ngôn ngữ Google Dịch (`zh-CN`, `vi`, `ja`…) → mã BCP-47 mà Web Speech nhận.
// Chỉ liệt kê những thứ app thật sự dùng; còn lại rơi về tiếng Anh.
const SPEECH_BY_SOURCE = {
    en: 'en-US',
    vi: 'vi-VN',
    zh: 'zh-CN',
    ja: 'ja-JP',
    ko: 'ko-KR',
    fr: 'fr-FR',
    de: 'de-DE',
};

/**
 * Mã nhận diện cho một ngôn ngữ NGUỒN do người dùng chọn (ô "Dịch từ").
 *
 * Khác `speechLangFor`: hàm kia chỉ biết 'en'/'zh' (ngôn ngữ đang HỌC), truyền
 * 'vi' vào nó sẽ ra 'en-US' — thu âm tiếng Việt mà bộ nhận diện nghe tiếng Anh.
 *
 * @param {string} source mã Google Dịch, vd 'zh-CN', 'vi', hoặc 'auto'
 * @param {string} fallback mã BCP-47 dùng khi source là 'auto' hoặc lạ
 */
export function speechLangForSource(source, fallback = 'en-US') {
    if (!source || source === 'auto') return fallback;
    // 'zh-CN' / 'zh-TW' đều về 'zh'; 'pt-BR' về 'pt'.
    const base = String(source).toLowerCase().split('-')[0];
    return SPEECH_BY_SOURCE[base] || fallback;
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
    /**
     * Phần đã chốt của những PHIÊN TRƯỚC (mỗi lần trình duyệt tự ngắt là hết
     * một phiên). Phần đã chốt của phiên ĐANG chạy không nằm ở đây — nó được
     * dựng lại từ `e.results` mỗi lần `onresult`.
     *
     * Vì sao tách hai: khi trình duyệt tự bật lại, `e.resultIndex` quay về 0 và
     * `e.results` là mảng của phiên MỚI. Cộng dồn thẳng vào một biến chung thì
     * phần đã chốt bị cộng lần thứ hai — gõ "你好" ra "你好你好", đúng lỗi người
     * dùng gặp khi bật/tắt micro.
     */
    let doneText = '';
    let destroyed = false;

    function build() {
        const r = new Recognition();
        r.lang = lang;
        r.continuous = true;
        r.interimResults = true;

        r.onresult = (e) => {
            // DỰNG LẠI từ đầu `e.results` chứ không cộng dồn: mảng này luôn chứa
            // TOÀN BỘ kết quả của phiên hiện tại, nên đọc lại từ 0 là chính xác
            // dù `onresult` bắn bao nhiêu lần. Cộng dồn theo `resultIndex` thì
            // mỗi lần trình duyệt gửi lại một đoạn đã chốt là nhân đôi đoạn đó.
            let phienNay = '';
            let interim = '';
            for (let i = 0; i < e.results.length; i++) {
                const chunk = e.results[i][0].transcript;
                if (e.results[i].isFinal) phienNay += chunk;
                else interim += chunk;
            }
            // Chốt chặn cuối: một số bản Chrome trả lại NGUYÊN kết quả đã chốt
            // của phiên trước trong phiên mới. Lúc đó `doneText` và `phienNay`
            // bắt đầu bằng cùng một đoạn — ghép thẳng là nhân đôi. Bỏ phần
            // chồng lấn thay vì tin phiên mới luôn rỗng.
            if (doneText && phienNay.startsWith(doneText)) {
                phienNay = phienNay.slice(doneText.length);
            }

            r._daChot = phienNay;   // để `onend` gộp vào `doneText` khi phiên kết thúc
            const full = (doneText + phienNay + interim).trim();
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
            // Chốt phần của phiên vừa kết thúc vào `doneText` TRƯỚC khi bật lại:
            // phiên mới sẽ có `e.results` riêng, không còn nội dung này nữa.
            doneText += r._daChot || '';
            r._daChot = '';

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
            doneText = '';
            if (rec) rec._daChot = '';
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
