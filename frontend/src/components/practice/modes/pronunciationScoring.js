// Chấm kết quả nhận dạng giọng nói.
//
// Tách khỏi pronunciationMode.js vì đây là logic THUẦN — vào chuỗi, ra điểm.
// Không cần mic, không cần DOM, nên test được đầy đủ; phần còn lại của chế độ
// phát âm thì không, vì phụ thuộc Web Speech API mà jsdom không có.
//
// Giới hạn phải nói rõ: Web Speech API trả về CHỮ đã nhận dạng, không trả âm
// thanh thô. Nên đây là "máy có nghe ra đúng từ không", KHÔNG phải chấm phát âm
// theo từng âm vị. Nói sai thanh mà máy vẫn đoán đúng chữ thì ta không biết.

/** Bỏ dấu câu và khoảng trắng để so — giữ nguyên chữ. */
export function normalize(text, isZh) {
    const t = String(text ?? '');
    return isZh
        // Dấu câu Trung + Latin. Bỏ hết khoảng trắng vì tiếng Trung không dùng.
        ? t.replace(/[\s　-〿＀-￯.,!?;:'"]/g, '')
        : t.toLowerCase().replace(/[.,!?;:'"]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Khoảng cách Levenshtein — số thao tác sửa tối thiểu để biến a thành b.
 *
 * Dùng để trả lời "gần đúng đến đâu" thay vì chỉ đúng/sai. So `===` tuyệt đối
 * coi thiếu một chữ trong từ 4 chữ nghiêm trọng ngang nói sai hoàn toàn — người
 * học không phân biệt được mình đang tiến bộ hay không.
 */
export function editDistance(a, b) {
    const s = [...a], t = [...b];       // [...] để đếm đúng ký tự Unicode
    if (s.length === 0) return t.length;
    if (t.length === 0) return s.length;

    let prev = Array.from({ length: t.length + 1 }, (_, i) => i);
    for (let i = 1; i <= s.length; i++) {
        const cur = [i];
        for (let j = 1; j <= t.length; j++) {
            cur[j] = Math.min(
                prev[j] + 1,                                   // xoá
                cur[j - 1] + 1,                                // thêm
                prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1)  // thay
            );
        }
        prev = cur;
    }
    return prev[t.length];
}

/** Độ tương đồng 0..1 theo số ký tự khớp. */
export function similarity(a, b) {
    if (!a && !b) return 1;
    const longest = Math.max([...a].length, [...b].length);
    if (longest === 0) return 1;
    return 1 - editDistance(a, b) / longest;
}

// Ngưỡng "gần đúng".
//
// Ban đầu tôi đặt một ngưỡng tỉ lệ duy nhất là 0.8 và tự lập luận rằng nó hợp
// lý. Chạy thử trên ca thật thì bác bỏ ngay: `你好` vs `你好吗` chỉ ra 0.67 →
// trượt, trong khi đó chính là ca máy nhận dạng TỰ THÊM trợ từ, người học nói
// hoàn toàn chuẩn. Từ tiếng Trung đa số 2 chữ, nên mọi sai lệch 1 chữ đều rơi
// xuống 0.5–0.67 và ngưỡng tỉ lệ gần như không bao giờ kích hoạt.
//
// Nên với từ NGẮN phải chấm theo SỐ CHỮ sai, không theo tỉ lệ: từ ≤3 ký tự cho
// phép lệch đúng 1; từ dài hơn mới dùng tỉ lệ, vì lúc đó tỉ lệ mới có nghĩa.
// Thử "từ ngắn cho lệch 1 ký tự" thì hỏng nặng hơn: `买` vs `卖` — hai chữ khác
// hẳn, nghĩa ngược nhau — cũng lệch đúng 1 nên được tính ĐẠT. Với từ 1 chữ thì
// MỌI chữ khác đều lệch 1. Từ càng ngắn càng phải NGHIÊM, không phải càng lỏng.
//
// Quy tắc cuối, phân biệt hai loại sai khác hẳn nhau về bản chất:
//   - THÊM/BỚT ở đầu-cuối (`你好` → `你好吗`): máy nhận dạng tự chèn trợ từ, hoặc
//     nuốt mất chữ cuối. Người học nói đúng phần cốt lõi → cho qua.
//   - THAY ký tự (`买` → `卖`, `brand` → `bread`): nói ra âm khác → KHÔNG cho qua,
//     dù chỉ lệch một ký tự. Đây chính là lỗi cần người học sửa.
export const NEAR_THRESHOLD = 0.75;

/** Một chuỗi có chứa trọn chuỗi kia không (chỉ thừa/thiếu ở hai đầu). */
function isSubsequenceOfEnds(shorter, longer) {
    return longer.includes(shorter);
}

/**
 * Gần đúng chưa?
 *
 * Chỉ tha THỪA/THIẾU ở hai đầu, tuyệt đối không tha THAY ký tự — vì thay ký tự
 * nghĩa là phát ra âm khác, đúng thứ mà bài luyện phát âm cần bắt.
 */
export function isNear(heard, want) {
    if (!heard || !want) return false;
    if (heard === want) return true;

    const h = [...heard], w = [...want];
    const shorter = h.length <= w.length ? heard : want;
    const longer  = h.length <= w.length ? want : heard;
    const diff = Math.abs(h.length - w.length);

    // Chỉ thừa/thiếu ở hai đầu, và phần cốt lõi phải đủ dài để có nghĩa —
    // `你` nằm trong `你好` nhưng nói mỗi `你` thì chưa phải nói được `你好`.
    if (isSubsequenceOfEnds(shorter, longer)) {
        return [...shorter].length >= 2 && diff <= Math.max(1, Math.floor([...longer].length / 3));
    }

    // Còn lại: dùng tỉ lệ, và chỉ áp cho từ đủ dài để tỉ lệ có nghĩa.
    return [...want].length >= 4 && similarity(heard, want) >= NEAR_THRESHOLD;
}

/**
 * Chấm một lượt nói.
 *
 * @param {string}   transcript   chữ máy nghe được (bản tốt nhất)
 * @param {string[]} alternatives các bản đoán khác, THEO THỨ HẠNG tin cậy giảm dần
 * @param {string}   target       từ cần nói
 * @param {boolean}  isZh         tiếng Trung hay không
 * @returns {{correct:boolean, near:boolean, similarity:number, matchedRank:number, heard:string}}
 */
export function scoreAttempt(transcript, alternatives, target, isZh) {
    const want = normalize(target, isZh);
    const heard = normalize(transcript, isZh);

    // Xét cả các bản đoán thay thế, nhưng GIỮ THỨ HẠNG.
    //
    // Bản cũ chỉ hỏi "có bản nào khớp không" rồi coi khớp ở vị trí 5 chuẩn
    // ngang vị trí 1. Thứ hạng là thông tin thật: khớp ở hạng chót nghĩa là máy
    // nghe ra thứ khác trước, tức là phát âm chưa rõ. Ta vẫn tính đúng, nhưng
    // biết được để nói với người học.
    const ranked = [transcript, ...(alternatives || [])]
        .map(t => normalize(t, isZh))
        .filter(Boolean);

    const exactRank = ranked.findIndex(t => t === want);
    if (exactRank !== -1) {
        return { correct: true, near: false, similarity: 1, matchedRank: exactRank, heard };
    }

    // Không bản nào khớp hẳn → lấy bản giống nhất để đo mức gần.
    let best = 0;
    let bestRank = -1;
    ranked.forEach((t, i) => {
        const s = similarity(t, want);
        if (s > best) { best = s; bestRank = i; }
    });

    const near = bestRank !== -1 && isNear(ranked[bestRank], want);
    return { correct: near, near, similarity: best, matchedRank: near ? bestRank : -1, heard };
}

/**
 * Câu phản hồi cho người học — nói RÕ sai ở đâu thay vì chỉ "Chưa đúng".
 *
 * "Chưa đúng" không dạy được gì. "Nghe thành 你好吗 — thừa chữ 吗" thì người học
 * biết ngay phải sửa gì ở lần sau.
 */
export function feedbackMessage(result, target, isZh) {
    if (result.correct && result.similarity === 1) {
        // Khớp hẳn nhưng ở hạng thấp = máy phải đoán mấy lần mới ra.
        return result.matchedRank > 0
            ? 'Đúng rồi, nhưng phát âm chưa thật rõ — thử nói dứt khoát hơn.'
            : 'Phát âm rất chuẩn!';
    }
    if (result.near) {
        const pct = Math.round(result.similarity * 100);
        return `Gần đúng (${pct}%) — máy nghe thành "${result.heard}".`;
    }
    if (!result.heard) return 'Không nghe rõ — thử nói to và chậm hơn.';

    const want = normalize(target, isZh);
    if ([...result.heard].length > [...want].length) return `Nghe thành "${result.heard}" — có vẻ thừa âm.`;
    if ([...result.heard].length < [...want].length) return `Nghe thành "${result.heard}" — có vẻ thiếu âm.`;
    return `Nghe thành "${result.heard}".`;
}
