/**
 * Nghe với AI (bản TTS): AI viết một đoạn ngắn có dùng từ mục tiêu, máy đọc bằng
 * giọng TTS, người học gõ lại những gì nghe được, server chấm theo từng từ.
 *
 * Chấm theo từ là phép so khớp chuỗi (không gọi AI): rẻ, nhanh, khách quan.
 * Đoạn gốc chỉ nằm trên server — client chỉ nhận âm thanh, không nhận chữ.
 */
const { textCompletion } = require('./aiClient');
const { CHI_THI_HOP_BOI_CANH } = require('./dangBai');

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
 * Kho DẠNG NGHE — chỉ dạng MỘT người nói: TTS hiện đọc bằng một giọng, hội thoại
 * hai người đọc một giọng nghe như độc thoại và khó phân vai. Nghe không có kiểu
 * chấm nên `hop` để trống. Khoá khớp `NHOM_DANG` ở
 * frontend/src/components/listening/ListeningScreen.jsx.
 * "Ngẫu nhiên" (không chọn) giữ đoạn như trước: tình huống đời thường hoặc công sở.
 */
const NHOM_DANG_NGHE = [
    {
        key: 'thong-bao', vi: 'Thông báo', hop: [],
        dang: [
            { key: 'airport', vi: 'Sân bay', en: 'airport announcement' },
            { key: 'station', vi: 'Nhà ga / bến xe', en: 'train or bus station announcement' },
            { key: 'store', vi: 'Siêu thị / cửa hàng', en: 'in-store announcement' },
            { key: 'voicemail', vi: 'Tin nhắn thoại', en: 'voicemail message' },
            { key: 'weather', vi: 'Dự báo thời tiết', en: 'weather forecast' },
        ],
    },
    {
        key: 'tin-podcast', vi: 'Tin tức & podcast', hop: [],
        dang: [
            { key: 'news', vi: 'Bản tin', en: 'radio news headline' },
            { key: 'podcast', vi: 'Podcast', en: 'podcast host introducing an episode' },
            { key: 'radio-ad', vi: 'Quảng cáo radio', en: 'radio advertisement' },
            { key: 'tour', vi: 'Hướng dẫn viên', en: 'tour guide talking to a group' },
            { key: 'traffic', vi: 'Tin giao thông', en: 'traffic report' },
        ],
    },
    {
        key: 'hoc-viec', vi: 'Học tập & công việc', hop: [],
        dang: [
            { key: 'lecture', vi: 'Bài giảng', en: 'short excerpt from a lecture' },
            { key: 'meeting', vi: 'Mở đầu cuộc họp', en: 'manager opening a meeting' },
            { key: 'instructions', vi: 'Hướng dẫn', en: 'spoken step-by-step instructions' },
            { key: 'presentation', vi: 'Thuyết trình', en: 'short product presentation' },
            { key: 'training', vi: 'Đào tạo nhân viên', en: 'trainer briefing new staff' },
        ],
    },
    {
        key: 'doi-thuong', vi: 'Đời thường', hop: [],
        dang: [
            { key: 'story', vi: 'Kể chuyện', en: 'person telling a short personal story' },
            { key: 'directions', vi: 'Chỉ đường', en: 'person giving directions to a place' },
            { key: 'recipe', vi: 'Nấu ăn', en: 'person explaining how to cook a dish' },
            { key: 'review', vi: 'Nhận xét', en: 'person giving a spoken review of a film or restaurant' },
            { key: 'speech', vi: 'Lời chúc / phát biểu', en: 'short toast or speech at an event' },
        ],
    },
];

/**
 * Nhờ AI viết đoạn nghe ngắn dùng các từ mục tiêu. Trả về chuỗi đoạn văn thuần,
 * không tiêu đề, không dấu nháy. Lỗi AI được ném ra để controller hoàn năng lượng.
 */
async function sinhDoanNghe({ targetWords = [], level = 'medium', userId = null, chon = null }) {
    const cefr = CEFR_NGHE[level] || CEFR_NGHE.medium;
    const out = await textCompletion({
        feature: 'listening-generate',
        messages: [
            {
                role: 'system',
                content: [
                    'You write a short English passage for listening practice.',
                    `Use vocabulary at CEFR level ${cefr}.`,
                    chon
                        // Dạng người học chọn (từ kho hoặc tự nhập, đã làm sạch ở `chonDang`).
                        ? `The passage is 2 to 4 sentences, at most 40 words, spoken by ONE person, in the form of: ${chon.en}.`
                        : 'The passage is 2 to 4 sentences, at most 40 words, in a realistic everyday or workplace situation.',
                    'Use the given words naturally (each at least once when possible).',
                    ...(chon ? [CHI_THI_HOP_BOI_CANH] : []),
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
    NHOM_DANG_NGHE,
};
