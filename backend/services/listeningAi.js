/**
 * Nghe với AI (bản TTS): AI viết một đoạn ngắn có dùng từ mục tiêu, máy đọc bằng
 * giọng TTS, người học gõ lại những gì nghe được, server chấm theo từng từ —
 * tiếng Anh theo TỪ, tiếng Trung theo từng CHỮ HÁN (tiếng Trung không có dấu cách
 * giữa các từ, nên tách theo dấu cách là ra rỗng).
 *
 * Chấm theo từ là phép so khớp chuỗi (không gọi AI): rẻ, nhanh, khách quan.
 * Đoạn gốc chỉ nằm trên server — client chỉ nhận âm thanh, không nhận chữ.
 */
const { textCompletion } = require('./aiClient');
const { CHI_THI_HOP_BOI_CANH } = require('./dangBai');

/** Đoạn nghe tối đa — đủ dài để nghe, không đủ dài để chép tràn. */
const MAX_WORDS_DOAN = 45;

/** Đoạn nghe tiếng Trung tối đa (số ký tự, kể cả dấu câu). */
const MAX_KY_TU_DOAN_ZH = 90;

/** Mức khó (easy/medium/hard) → dải CEFR của đoạn nghe tiếng Anh. */
const CEFR_NGHE = { easy: 'A1–A2', medium: 'B1–B2', hard: 'C1–C2' };
/** Mức khó → cấp HSK của đoạn nghe tiếng Trung. */
const HSK_NGHE = { easy: 'HSK 1–2', medium: 'HSK 3–4', hard: 'HSK 5–6' };

/** Giọng đọc theo ngôn ngữ: giọng nữ tự nhiên của Edge TTS. */
const GIONG_THEO_NGON_NGU = { en: 'en-US-AriaNeural', zh: 'zh-CN-XiaoxiaoNeural' };

/**
 * Chuẩn hoá về mảng đơn vị để so khớp: mỗi CHỮ HÁN là một đơn vị, chữ Latin/số
 * theo từ (chữ thường, giữ dấu nháy); dấu câu và khoảng trắng bị bỏ.
 * Một hàm cho cả hai thứ tiếng: đoạn tiếng Anh không có chữ Hán nên chấm y như cũ.
 */
function tachTu(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[’`]/g, "'")
        .match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]|[a-z0-9']+/g) || [];
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

/** Bỏ dấu nháy bao ngoài, gom khoảng trắng, cắt theo trần từ (tiếng Trung: theo ký tự). */
function lamSachDoan(raw, lang = 'en') {
    let text = String(raw || '')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^["'“”]+|["'“”]+$/g, '')
        .trim();
    if (lang === 'zh') {
        const kyTu = [...text];
        if (kyTu.length > MAX_KY_TU_DOAN_ZH) text = kyTu.slice(0, MAX_KY_TU_DOAN_ZH).join('');
        return text;
    }
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
async function sinhDoanNghe({ targetWords = [], level = 'medium', userId = null, chon = null, lang = 'en' }) {
    const zh = lang === 'zh';
    const cefr = CEFR_NGHE[level] || CEFR_NGHE.medium;
    const hsk = HSK_NGHE[level] || HSK_NGHE.medium;
    // Tiếng Trung: đo bằng CHỮ, không phải từ ("40 words" model không đo được).
    const doDai = zh ? 'at most 60 Chinese characters' : 'at most 40 words';
    const out = await textCompletion({
        feature: 'listening-generate',
        messages: [
            {
                role: 'system',
                content: [
                    zh
                        ? 'You write a short Simplified Chinese passage for listening practice.'
                        : 'You write a short English passage for listening practice.',
                    zh ? `Use vocabulary and grammar at ${hsk} level.` : `Use vocabulary at CEFR level ${cefr}.`,
                    chon
                        // Dạng người học chọn (từ kho hoặc tự nhập, đã làm sạch ở `chonDang`).
                        ? `The passage is 2 to 4 sentences, ${doDai}, spoken by ONE person, in the form of: ${chon.en}.`
                        : `The passage is 2 to 4 sentences, ${doDai}, in a realistic everyday or workplace situation.`,
                    // Người học gõ lại bằng chữ Hán: pinyin hay tiếng Anh lẫn vào là chấm sai.
                    ...(zh ? ['Write only Chinese characters and Chinese punctuation: no pinyin, no English.'] : []),
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
    const doan = lamSachDoan(out.text, lang);
    if (tachTu(doan).length < 5) throw new Error('AI trả về đoạn nghe quá ngắn');
    return doan;
}

module.exports = {
    chamNghe,
    sinhDoanNghe,
    tachTu,
    lamSachDoan,
    MAX_WORDS_DOAN,
    MAX_KY_TU_DOAN_ZH,
    NHOM_DANG_NGHE,
    GIONG_THEO_NGON_NGU,
};
