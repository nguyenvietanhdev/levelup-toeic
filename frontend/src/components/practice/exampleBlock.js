/**
 * Khối CÂU VÍ DỤ dùng chung: câu + nút Dịch + nút Nghe + phiên âm.
 *
 * Vì sao gom về một chỗ: rà soát 12 chế độ có hiện câu ví dụ thì chỉ 2 chế độ
 * có đủ nút dịch và phiên âm. Mười chế độ còn lại hiện câu tiếng Anh trần —
 * người học đọc được mặt chữ nhưng không hiểu nghĩa và không biết đọc thế nào,
 * mà câu ví dụ vốn là chỗ dạy CÁCH DÙNG từ, tức là chỗ cần hiểu nhất.
 *
 * Chép tay vào từng chế độ thì thành 10 chỗ để lệch: đổi thứ tự nút ở một chỗ,
 * quên `stopPropagation` ở chỗ khác, và không có gì báo. Một hàm dựng chung thì
 * sửa một lần là mọi chế độ giống nhau.
 *
 * Trả về HTML thay vì tự chèn vào DOM: mỗi chế độ có bố cục riêng và tự quyết
 * đặt khối này ở đâu — hàm này không đoán hộ.
 */
import { GameLogic } from '@game/gameLogic.js';
import { EventBus, GameEvents } from '@game/eventBus.js';
import { layPhienAmCau } from '@lib/sentencePinyin.js';

/** Bộ đếm để mỗi khối có id riêng — một màn có thể hiện nhiều câu ví dụ. */
let _dem = 0;

/**
 * HTML của khối câu ví dụ.
 *
 * @param {string} cau  câu ví dụ. Rỗng → trả '' (nơi gọi khỏi phải tự kiểm).
 * @param {object} opts
 *   - `nhan`: chữ đứng trước câu, mặc định không có.
 *   - `id`  : tiền tố id, tự sinh nếu không truyền.
 * @returns {{html: string, id: string}}
 */
export function htmlViDu(cau, { nhan = '', id = '' } = {}) {
    const text = String(cau || '').trim();
    if (!text) return { html: '', id: '' };

    const pre = id || `vd-${++_dem}`;
    // `escape` không cần ở đây: câu ví dụ đến từ DB của chính app, không phải
    // từ người dùng nhập. Các chế độ khác cũng chèn thẳng như vậy.
    return {
        id: pre,
        html: `
            <div class="word-info-panel example-block" id="${pre}-panel">
                <div class="word-info-example">
                    <i class="fas fa-quote-left" style="color: var(--primary-color); margin-right: 6px;"></i>
                    ${nhan ? `<strong>${nhan}</strong> ` : ''}
                    <span id="${pre}-text">${text}</span>
                    <button class="btn-speak-mini" id="${pre}-tr" title="Dịch cả câu">
                        <i class="fas fa-language"></i>
                    </button>
                    <button class="btn-speak-mini" id="${pre}-sp" title="Nghe phát âm câu ví dụ">
                        <i class="fas fa-volume-up"></i>
                    </button>
                </div>
                <div class="word-info-example-pinyin" id="${pre}-ph"></div>
            </div>`,
    };
}

/**
 * Gắn sự kiện và nạp phiên âm cho một khối đã chèn vào DOM.
 *
 * @param {string} id     tiền tố id từ `htmlViDu`
 * @param {string} cau    chính câu đó
 * @param {object} opts
 *   - `modeObj`: object chế độ, để bỏ kết quả phiên âm khi đã sang câu khác.
 *   - `goc`    : phần tử cha để tìm nút; mặc định `document`.
 */
export function ganViDu(id, cau, { modeObj = null, goc = document } = {}) {
    const text = String(cau || '').trim();
    if (!id || !text) return;

    const q = (sel) => goc.querySelector(sel);

    // Nút DỊCH đứng trước nút LOA — đọc hiểu rồi mới nghe.
    q(`#${id}-tr`)?.addEventListener('click', (e) => {
        // Khối này có thể nằm trong vùng đã có handler (thẻ lật, ô chọn đáp án);
        // không chặn thì một cú bấm chạy hai việc.
        e.stopPropagation();
        EventBus.emit(GameEvents.TRANSLATE_REQUESTED, { text });
    });

    q(`#${id}-sp`)?.addEventListener('click', (e) => {
        e.stopPropagation();
        // KHÔNG truyền ngôn ngữ: `speakWord` tự nhận chữ Hán và đổi sang zh-CN.
        // Truyền cứng 'en-US' là đọc câu tiếng Trung bằng giọng tiếng Anh.
        GameLogic.speakWord(text);
    });

    // Phiên âm nạp bất đồng bộ — KHÔNG `await`: đây là thông tin phụ trợ, chờ
    // nó là chặn cả câu hỏi.
    const idxLucGoi = modeObj?.currentIndex;
    layPhienAmCau(text).then((ph) => {
        if (!ph) return;
        // Bỏ nếu đã sang câu khác: người dùng bấm "Tiếp" nhanh hơn mạng thì
        // phiên âm của câu trước hiện dưới câu sau.
        if (modeObj && modeObj.currentIndex !== idxLucGoi) return;
        const el = goc.querySelector(`#${id}-ph`);
        if (el) el.textContent = ph;
    });
}

/**
 * Dựng và gắn trong một lần — dùng khi nơi gọi có sẵn phần tử chứa.
 *
 * @returns {boolean} có dựng được không (false khi câu rỗng).
 */
export function chenViDu(slot, cau, { nhan = '', modeObj = null } = {}) {
    if (!slot) return false;
    const { html, id } = htmlViDu(cau, { nhan });
    if (!html) return false;
    slot.innerHTML = html;
    ganViDu(id, cau, { modeObj, goc: slot });
    return true;
}
