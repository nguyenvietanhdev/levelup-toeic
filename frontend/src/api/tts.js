// ===================================
// TTS API SERVICE
// ===================================
// Backend giờ STREAM audio/mpeg trực tiếp (không cache file disk). Nhận
// blob → tạo Object URL để gameLogic gắn vào new Audio() phát; caller
// PHẢI revoke URL sau khi audio kết thúc (xem gameLogic.speakWord).

export const TtsAPI = {
    async synthesize(text, lang, rate) {
        const res = await fetch(
            `/api/tts?text=${encodeURIComponent(text)}&lang=${lang}&rate=${rate}`
        );
        // Ném lỗi thay vì trả `{ success: false }`: bản cũ để nơi gọi nhận một
        // đối tượng không có `url`, và nhánh đó chỉ gọi `onEnd` — không phát gì,
        // không fallback. Ném lỗi thì `catch` của nơi gọi lo được việc lùi về
        // giọng trình duyệt.
        if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);
        const blob = await res.blob();
        return { url: URL.createObjectURL(blob) };
    },
};
