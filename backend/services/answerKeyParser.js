/**
 * Đọc BỘ ĐÁP ÁN đề TOEIC admin dán vào → map { số câu: 'A'|'B'|'C'|'D' }.
 *
 * Toàn bộ file là hàm thuần, KHÔNG gọi AI: server không trả tiền token cho việc
 * đọc bảng đáp án. Muốn lấy JSON từ ảnh thì admin tự dán ảnh vào chat AI kèm
 * prompt sẵn ở tab admin, rồi dán kết quả về đây.
 */

/** "1-100" / "1 – 100" / "1,100" → { from: 1, to: 100 }. Sai định dạng → null. */
function parseRange(text) {
    const s = String(text || '').trim();
    if (!s) return null;
    const m = s.match(/^(\d{1,3})\s*[-–—,]\s*(\d{1,3})$/);
    if (!m) {
        // Nhập một số → coi là đúng câu đó.
        const one = s.match(/^(\d{1,3})$/);
        if (!one) return null;
        const n = parseInt(one[1], 10);
        return n >= 1 && n <= 200 ? { from: n, to: n } : null;
    }
    const from = parseInt(m[1], 10);
    const to = parseInt(m[2], 10);
    if (from < 1 || to > 200 || from > to) return null;
    return { from, to };
}

/**
 * Lọc & chuẩn hoá kết quả AI trả về: chỉ giữ câu nằm TRONG dải đã khai báo và
 * đáp án hợp lệ. AI đọc nhầm số câu ngoài dải là chuyện thường — giữ lại thì
 * sẽ ghi đè nhầm sang phần đề khác.
 */
function normalizeAnswers(raw, range) {
    const out = {};
    const skipped = [];
    for (const [k, v] of Object.entries(raw || {})) {
        const num = parseInt(String(k).replace(/\D/g, ''), 10);
        const ans = String(v || '').trim().toUpperCase();
        if (!Number.isFinite(num) || !['A', 'B', 'C', 'D'].includes(ans)) {
            skipped.push({ number: k, answer: v, reason: 'không đọc được' });
            continue;
        }
        if (range && (num < range.from || num > range.to)) {
            skipped.push({ number: num, answer: ans, reason: `ngoài dải ${range.from}-${range.to}` });
            continue;
        }
        out[num] = ans;
    }
    return { answers: out, skipped };
}

/** Lỗi người dùng sửa được → errorHandler trả 400 kèm lời nhắn, không phải 500 trống. */
function badInput(message) {
    const e = new Error(message);
    e.statusCode = 400;
    return e;
}

// Tên trường hay gặp khi copy JSON đáp án từ nơi khác về.
const NUMBER_FIELDS = ['number', 'num', 'n', 'no', 'q', 'question', 'stt', 'cau', 'câu'];
const ANSWER_FIELDS = ['answer', 'ans', 'correct', 'correctanswer', 'value', 'key', 'dapan', 'đápán'];

function pickField(obj, names) {
    for (const k of Object.keys(obj)) {
        if (names.includes(k.trim().toLowerCase())) return obj[k];
    }
    return undefined;
}

/**
 * Gỡ rào markdown và lời dẫn quanh JSON.
 *
 * Chat AI rất hay trả về ```json ... ``` hoặc "Đây là kết quả: {...}" dù prompt
 * đã dặn đừng. Bắt admin ngồi xoá tay là vô nghĩa — cắt hộ ngay tại đây.
 */
function stripJsonWrapper(text) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const body = (fenced ? fenced[1] : text).trim();

    // Còn lời dẫn hai đầu thì lấy đoạn từ dấu mở tới dấu đóng ngoài cùng. Phải
    // xét dấu mở nào ĐỨNG TRƯỚC, không thì mảng [{...},{...}] sẽ bị cắt mất hai
    // đầu ngoặc vuông và thành JSON hỏng.
    const candidates = [['{', '}'], ['[', ']']]
        .map(([open, close]) => ({ from: body.indexOf(open), to: body.lastIndexOf(close) }))
        .filter(c => c.from !== -1 && c.to > c.from)
        .sort((a, b) => a.from - b.from);

    return candidates.length ? body.slice(candidates[0].from, candidates[0].to + 1) : body;
}

/**
 * Vớt cặp "số câu – đáp án" từ text tự do: "101. A", "102) C", "103 - B".
 * Chặn chữ cái dính từ (vd "101. Answer") bằng lookahead, khỏi đọc nhầm.
 */
function parseLoosePairs(text) {
    const out = {};
    const re = /(\d{1,3})\s*[.):\-–—=]?\s*([A-Da-d])(?![A-Za-z])/g;
    let m;
    while ((m = re.exec(text)) !== null) out[parseInt(m[1], 10)] = m[2].toUpperCase();
    return out;
}

/**
 * Đọc bộ đáp án admin DÁN TAY — đường duy nhất để nạp đáp án.
 *
 * Nhận mọi dạng thường gặp khi copy đáp án từ nơi khác về:
 *   • object      {"101":"A","102":"C"}   (hoặc bọc {"answers":{...}})
 *   • mảng chữ    ["A","C","B"]           → đánh số liên tiếp từ đầu dải (mặc định 1)
 *   • mảng object [{"number":101,"answer":"A"}]
 *   • text tự do  "101. A  102) C"        → vớt cặp số–chữ
 *
 * Dán JSON do AI đọc hộ cũng vào đúng đường này — model hay bọc thêm markdown
 * hoặc lớp {"answers":{...}}, nên phần đọc phải chịu được mấy kiểu đó.
 *
 * @returns {{answers: object, skipped: array, format: string}}
 */
function parseAnswerText(input, range) {
    let data = input;

    if (typeof input !== 'object' || input === null) {
        const text = String(input ?? '').trim();
        if (!text) throw badInput('Chưa nhập nội dung đáp án');
        try {
            const j = JSON.parse(stripJsonWrapper(text));
            data = (j && typeof j === 'object') ? j : null;
        } catch (_) {
            data = null; // không phải JSON → thử đọc như text tự do
        }
        if (data === null) {
            const loose = parseLoosePairs(text);
            if (!Object.keys(loose).length) {
                throw badInput(
                    'Không đọc được đáp án nào. Dán JSON dạng {"101":"A","102":"C"} '
                    + 'hoặc ["A","C",...] hoặc danh sách "101. A  102. C".',
                );
            }
            return { ...normalizeAnswers(loose, range), format: 'text' };
        }
    }

    // Model/API khác hay bọc thêm một lớp {"answers": {...}}.
    if (!Array.isArray(data) && data.answers && typeof data.answers === 'object') data = data.answers;

    // Mảng chữ cái không mang số câu → phải tự đánh số, lấy mốc từ dải đã khai
    // báo. Không có dải thì mặc định câu 1 (và nói rõ ở thông báo trả về).
    const start = range ? range.from : 1;
    let raw = {};
    let format;

    if (Array.isArray(data)) {
        if (data.every(x => x === null || typeof x !== 'object')) {
            format = 'array';
            data.forEach((v, i) => { raw[start + i] = v; });
        } else {
            format = 'array-object';
            data.forEach((item, i) => {
                if (!item || typeof item !== 'object') return;
                const num = pickField(item, NUMBER_FIELDS);
                raw[num === undefined || num === null || num === '' ? start + i : num] =
                    pickField(item, ANSWER_FIELDS);
            });
        }
    } else {
        format = 'object';
        raw = data;
    }

    const result = normalizeAnswers(raw, range);
    if (!Object.keys(result.answers).length) {
        throw badInput(
            'Không có đáp án hợp lệ nào (chỉ nhận A/B/C/D'
            + (range ? `, trong khoảng ${range.from}-${range.to}` : '') + ')',
        );
    }
    return { ...result, format };
}

module.exports = { parseRange, normalizeAnswers, parseAnswerText };
