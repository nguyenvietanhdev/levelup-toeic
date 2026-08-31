// Chấm kết quả nhận dạng giọng nói.
//
// Tách khỏi pronunciationMode.js vì đây là logic THUẦN — vào chuỗi, ra điểm.
// Không cần mic, không cần DOM, nên test được đầy đủ; phần còn lại của chế độ
// phát âm thì không, vì phụ thuộc Web Speech API mà jsdom không có.
//
// Giới hạn phải nói rõ: Web Speech API trả về CHỮ đã nhận dạng, không trả âm
// thanh thô. Nên đây là "máy có nghe ra đúng từ không", KHÔNG phải chấm phát âm
// theo từng âm vị. Nói sai thanh mà máy vẫn đoán đúng chữ thì ta không biết.

/**
 * Lấy chuỗi ra khỏi thứ Web Speech trả về.
 *
 * `SpeechRecognitionResult` là một mảng-giống các `SpeechRecognitionAlternative`,
 * mỗi cái là OBJECT có `.transcript` — không phải chuỗi. Chuyền thẳng mảng đó
 * vào đây thì `String(object)` ra `"[object speechrecognitionalternative]"`, và
 * mọi bản đoán thay thế biến thành cùng một chuỗi rác.
 *
 * Hỏng KIỂU IM LẶNG, đó là chỗ đáng sợ: không lỗi, không cảnh báo, chỉ là bản
 * đoán hạng 2–5 không bao giờ khớp nữa. Đo trên ca thật — nói "brand", máy đoán
 * đầu ra "bread" và để "brand" ở hạng 2 — chế độ truyền object chấm SAI trong
 * khi chế độ truyền chuỗi chấm ĐÚNG, cùng một lượt nói.
 *
 * Nhận cả hai kiểu ở ĐÂY chứ không bắt từng nơi gọi tự nhớ: nơi gọi nào quên là
 * lỗi lại im lặng y hệt, mà không có gì báo.
 */
function layChu(x) {
    if (x == null) return '';
    if (typeof x === 'string') return x;
    return typeof x.transcript === 'string' ? x.transcript : '';
}

/** Bỏ dấu câu và khoảng trắng để so — giữ nguyên chữ. */
export function normalize(text, isZh) {
    const t = layChu(text);
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
 * Bản TẠM này đã đủ để chốt ngay chưa?
 *
 * ── VÌ SAO CẦN ──────────────────────────────────────────────────────────────
 * Web Speech không chốt kết quả khi người học nói xong — nó đợi im lặng một
 * quãng (Chrome khoảng 1–2 giây) rồi mới phát `isFinal`. Cả quãng đó màn hình
 * đứng im sau khi người học đã nói xong và đang chờ biết mình đúng hay sai.
 *
 * Nhưng bản tạm thì về gần như tức thì. Khi bản tạm đã khớp HẲN từ cần nói thì
 * không còn gì để đợi nữa — gọi `stop()` là bộ nhận dạng chốt luôn.
 *
 * ── VÌ SAO KHÔNG CHẤM THẲNG TRÊN BẢN TẠM ────────────────────────────────────
 * Vì bản tạm còn đổi: nói "拿" trên đường tới "拿铁" thì chấm sớm là cho điểm một
 * từ chưa nói xong. `stop()` khác hẳn — nó chỉ RÚT NGẮN thời gian chờ, còn điểm
 * vẫn chấm trên kết quả cuối như cũ. Không đổi một luật chấm nào.
 *
 * Chỉ nhận khớp HẲN, không nhận "gần đúng": gần đúng là lúc cần đợi thêm nhất,
 * vì bản tạm rất hay tự sửa lại thành đúng ở nhịp cuối.
 */
export function chotSomDuoc(interim, target, isZh) {
    const want = normalize(target, isZh);
    if (!want) return false;
    return normalize(interim, isZh) === want;
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

/**
 * Chấm một CÂU: từng từ một, thay vì đúng/sai cả câu.
 *
 * Vì sao cần riêng hàm này chứ không dùng `scoreAttempt` cho câu: câu 10 từ nói
 * sai 1 từ cho `similarity` khoảng 0.9 — vượt ngưỡng, tính là "gần đúng", và
 * người học không bao giờ biết đó là từ nào. Cả giá trị của việc luyện câu nằm
 * ở chỗ chỉ ra ĐÚNG từ phát âm sai.
 *
 * Căn theo THỨ TỰ bằng quy hoạch động (Needleman–Wunsch rút gọn), không so
 * theo chỉ số: máy nghe hụt hoặc thừa một từ thì so theo chỉ số làm mọi từ
 * phía sau lệch đi một nhịp và bị báo sai hết.
 *
 * Chỉ dùng cho tiếng Anh — tiếng Trung không tách từ bằng khoảng trắng, nên
 * "từng từ" không có nghĩa ở đó.
 *
 * @param {string} transcript  chữ máy nghe được
 * @param {string} target      câu cần nói
 * @returns {{words: Array<{word:string, ok:boolean, heard:string}>, correct:number,
 *            total:number, ratio:number}}
 */
/**
 * Hai từ tiếng Anh có coi là NÓI ĐÚNG cùng một từ không.
 *
 * KHÔNG dùng `isNear` — hàm đó chỉnh cho từ tiếng Trung và cho qua mọi sai lệch
 * một ký tự khi từ đủ dài. Chạy trên số thật: `wine`/`nine` ra 0.75 và được cho
 * qua, nhưng thay phụ âm đầu chính là loại lỗi phát âm ta cần bắt.
 *
 * Quy tắc ở đây phân biệt theo LOẠI sai lệch:
 *   - cùng bộ chữ cái, chỉ khác thứ tự (`recieve`/`receive`) → lỗi CHÍNH TẢ của
 *     bộ nhận dạng, cho qua: người học không phát âm sai gì cả.
 *   - thêm/bớt đuôi (`start`/`starts`) → máy nuốt âm cuối, cho qua.
 *   - thay ký tự → phát ra âm khác, KHÔNG cho qua dù chỉ lệch một.
 */
function cungMotTu(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;

    // Cùng bộ chữ cái = chỉ đảo thứ tự, không phải phát âm khác.
    const xep = (s) => [...s].sort().join('');
    if (xep(a) === xep(b)) return true;

    // Thêm/bớt ở ĐUÔI: một chuỗi là tiền tố của chuỗi kia, lệch tối đa 2 ký tự.
    const [ngan, dai] = a.length <= b.length ? [a, b] : [b, a];
    if (dai.startsWith(ngan) && dai.length - ngan.length <= 2) return true;

    return false;
}

export function scoreSentence(transcript, target, isZh = false) {
    // Tiếng Trung tách theo CHỮ, tiếng Anh theo TỪ.
    //
    // Không tách thì cả câu tiếng Trung tính là một "từ" duy nhất: sai một chữ
    // thành sai cả câu, và phản hồi ra "không nghe rõ" cho người vừa nói rành
    // rọt. Đó là lý do chế độ đọc câu từng bị tắt hẳn cho tiếng Trung — nhưng
    // tắt là bỏ mất tính năng, còn tách đúng đơn vị thì nó chạy được.
    // `cungMotTu` KHÔNG cần nhánh riêng cho tiếng Trung: với ký tự đơn nó cho
    // cùng kết quả như so bằng (`买`/`卖` → false, `昨`/`今` → false), vì cả ba
    // luật của nó — giống hệt, đảo thứ tự chữ cái, thêm/bớt đuôi — đều không
    // kích hoạt được trên một ký tự. Đã kiểm bằng số thật.
    const tach = (t) => (isZh ? [...t].filter((c) => c.trim()) : t.split(' ').filter(Boolean));
    const want = tach(normalize(target, isZh));
    const heard = tach(normalize(transcript, isZh));

    if (!want.length) return { words: [], correct: 0, total: 0, ratio: 0 };

    // `khop[i][j]` = số từ khớp nhiều nhất giữa want[i..] và heard[j..].
    const n = want.length, m = heard.length;
    const khop = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            // `cungMotTu` chứ không phải `===`: máy nghe "recieve" cho
            // "receive" là lỗi chính tả của bộ nhận dạng, không phải lỗi phát
            // âm của người học. Bắt lỗi đó là phạt oan.
            khop[i][j] = cungMotTu(heard[j], want[i])
                ? 1 + khop[i + 1][j + 1]
                : Math.max(khop[i + 1][j], khop[i][j + 1]);
        }
    }

    // Lần lại đường đi để biết từ nào đã khớp.
    const words = [];
    let i = 0, j = 0;
    while (i < n) {
        if (j < m && cungMotTu(heard[j], want[i])) {
            words.push({ word: want[i], ok: true, heard: heard[j] });
            i++; j++;
        } else if (j < m && khop[i][j + 1] >= khop[i + 1][j]) {
            // Máy nghe thừa một từ — bỏ qua nó, không tính lỗi cho người học.
            j++;
        } else {
            words.push({ word: want[i], ok: false, heard: '' });
            i++;
        }
    }

    // `n > 0` chắc chắn: câu đích rỗng đã thoát ở `return` phía trên.
    const correct = words.filter(w => w.ok).length;
    return { words, correct, total: n, ratio: correct / n };
}

/**
 * Câu phản hồi cho một lượt đọc CÂU.
 *
 * Nêu đích danh tối đa 3 từ sai. Liệt kê hết thì câu 10 từ sai 8 cho một dòng
 * dài không ai đọc, mà 3 từ đầu đã đủ để biết phải luyện gì.
 */
export function sentenceFeedback(result) {
    if (!result.total) return 'Không có câu để đọc.';
    if (!result.correct) return 'Không nghe rõ — thử nói to và chậm hơn.';
    if (result.correct === result.total) return 'Cả câu đều rõ — rất tốt!';

    const sai = result.words.filter(w => !w.ok).map(w => w.word);
    const nêu = sai.slice(0, 3).map(w => `"${w}"`).join(', ');
    const con = sai.length > 3 ? ` và ${sai.length - 3} từ nữa` : '';
    return `Đúng ${result.correct}/${result.total} từ. Chưa rõ: ${nêu}${con}.`;
}
