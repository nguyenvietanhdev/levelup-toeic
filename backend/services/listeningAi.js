/**
 * Nghe với AI (bản TTS): AI viết một đoạn ngắn có dùng từ mục tiêu, máy đọc bằng
 * giọng TTS, người học gõ lại những gì nghe được, server chấm theo từng từ.
 *
 * Chấm theo từ là phép so khớp chuỗi (không gọi AI): rẻ, nhanh, khách quan.
 * Đoạn gốc chỉ nằm trên server — client chỉ nhận âm thanh, không nhận chữ.
 */
const { textCompletion } = require('./aiClient');

/** Đoạn nghe tối đa — đủ dài để nghe, không đủ dài để chép tràn. */
const MAX_WORDS_DOAN = 45;

/** Mức khó (easy/medium/hard) → dải CEFR của đoạn nghe. */
const CEFR_NGHE = { easy: 'A1–A2', medium: 'B1–B2', hard: 'C1–C2' };

/** Chuẩn hoá về mảng từ thường để so khớp: chữ thường, bỏ dấu câu, giữ dấu nháy. */
function tachTu(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[’`]/g, "'")
        .match(/[a-z0-9']+/g) || [];
}

/**
 * Chấm bài chép lại. So khớp theo chuỗi con chung dài nhất (LCS) nên từ đúng nhưng
 * lệch vị trí vẫn được tính, và từ bị bỏ sót hay gõ thừa đều nhìn thấy được.
 *
 * @returns {{ score: number, total: number, correct: number,
 *             missing: string[], extra: string[] }}
 */
function chamNghe(doanGoc, baiGo) {
    const goc = tachTu(doanGoc);
    const go = tachTu(baiGo);
    const n = goc.length;
    const m = go.length;

    // Bảng LCS: dp[i][j] = độ dài chuỗi con chung của goc[0..i) và go[0..j).
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = 1; i <= n; i += 1) {
        for (let j = 1; j <= m; j += 1) {
            dp[i][j] = goc[i - 1] === go[j - 1]
                ? dp[i - 1][j - 1] + 1
                : Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
    }

    // Truy vết để biết từ nào của đoạn gốc được nghe đúng, từ nào bị bỏ sót.
    const khopGoc = new Array(n).fill(false);
    const khopGo = new Array(m).fill(false);
    let i = n;
    let j = m;
    while (i > 0 && j > 0) {
        if (goc[i - 1] === go[j - 1]) {
            khopGoc[i - 1] = true;
            khopGo[j - 1] = true;
            i -= 1;
            j -= 1;
        } else if (dp[i - 1][j] >= dp[i][j - 1]) {
            i -= 1;
        } else {
            j -= 1;
        }
    }

    const correct = dp[n][m];
    return {
        score: n ? Math.round((correct / n) * 100) : 0,
        total: n,
        correct,
        missing: goc.filter((_, k) => !khopGoc[k]),
        extra: go.filter((_, k) => !khopGo[k]),
    };
}

/** Bỏ dấu nháy bao ngoài, gom khoảng trắng, cắt theo trần từ. */
function lamSachDoan(raw) {
    let text = String(raw || '')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^["'“”]+|["'“”]+$/g, '')
        .trim();
    const tu = text.split(' ');
    if (tu.length > MAX_WORDS_DOAN) text = tu.slice(0, MAX_WORDS_DOAN).join(' ');
    return text;
}

/**
 * Nhờ AI viết đoạn nghe ngắn dùng các từ mục tiêu. Trả về chuỗi đoạn văn thuần,
 * không tiêu đề, không dấu nháy. Lỗi AI được ném ra để controller hoàn năng lượng.
 */
async function sinhDoanNghe({ targetWords = [], level = 'medium', userId = null }) {
    const cefr = CEFR_NGHE[level] || CEFR_NGHE.medium;
    const out = await textCompletion({
        feature: 'listening-generate',
        messages: [
            {
                role: 'system',
                content: [
                    'You write a short English passage for listening practice.',
                    `Use vocabulary at CEFR level ${cefr}.`,
                    'The passage is 2 to 4 sentences, at most 40 words, in a realistic everyday or workplace situation.',
                    'Use the given words naturally (each at least once when possible).',
                    'Reply with the plain passage only: no title, no quotes, no labels.',
                ].join('\n'),
            },
            { role: 'user', content: `Words: ${targetWords.join(', ')}` },
        ],
        maxTokens: 120,
        temperature: 0.9,
        userId,
    });
    const doan = lamSachDoan(out.text);
    if (tachTu(doan).length < 5) throw new Error('AI trả về đoạn nghe quá ngắn');
    return doan;
}

module.exports = {
    chamNghe,
    sinhDoanNghe,
    tachTu,
    lamSachDoan,
    MAX_WORDS_DOAN,
};
