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
        if (!res.ok) return { success: false };
        const blob = await res.blob();
        return { url: URL.createObjectURL(blob) };
    },
};
