/**
 * Ước lượng điểm TOEIC "nếu đi thi thật" từ lịch sử bài đã làm.
 *
 * Hai nguồn dữ liệu KHÔNG cùng đơn vị, phải xử lý khác nhau — trộn thẳng là sai
 * nặng:
 *
 *  - FULL TEST (200 câu): `totalScore` đã quy đổi qua bảng ETS → là điểm thật
 *    trên thang 990, dùng trực tiếp.
 *  - MINI TEST (một Part): `listeningScore/readingScore` chỉ là PHẦN TRĂM đúng
 *    nhân 495. Làm đúng 15/30 câu Part 5 ra "readingScore = 248" — con số đó
 *    không phải điểm Reading, chỉ là 50% được scale lên. Bình quân nó với điểm
 *    full test là bịa số. Ở đây mini test chỉ được dùng ở mức ĐỘ CHÍNH XÁC theo
 *    từng Part, rồi chiếu lên số câu chuẩn của một đề đầy đủ và mới quy đổi.
 *
 * KHÔNG có hệ số "trừ hao khi thi thật" nào ở đây. Thi ở nhà thường cao điểm
 * hơn thi thật (không áp lực, được dừng, đề quen), nhưng bịa ra một hằng số trừ
 * đi là chế dữ liệu. Thay vào đó trả về một KHOẢNG kèm mức tin cậy, phần diễn
 * giải để giao diện nói rõ.
 */
const { convertToToeicScore } = require('../utils/toeicScoreConverter');

// Số câu chuẩn mỗi Part trong một đề TOEIC đầy đủ (tổng 200).
const PART_COUNTS = { 1: 6, 2: 25, 3: 39, 4: 30, 5: 30, 6: 16, 7: 54 };
const LISTENING_PARTS = [1, 2, 3, 4];
const READING_PARTS = [5, 6, 7];

// Bài mới phản ánh trình độ hiện tại sát hơn bài ba tháng trước.
const DECAY = 0.75;

// Sai số tối thiểu của ước lượng (điểm, cho cả hai phía). Ngay cả ETS cũng có
// sai số đo ~±35 trên thang tổng, nên báo một con số duy nhất là giả vờ chính
// xác hơn thực tế.
const SPREAD_BY_SAMPLES = { 1: 60, 2: 45 };
const SPREAD_FLOOR = 35;

const clampScore = (n) => Math.max(10, Math.min(990, n));
/** Điểm TOEIC luôn là bội của 5. */
const round5 = (n) => Math.round(n / 5) * 5;

/** Trung bình có trọng số giảm dần theo thứ tự (phần tử ĐẦU = mới nhất). */
function weightedMean(values) {
    let num = 0, den = 0;
    values.forEach((v, i) => {
        const w = Math.pow(DECAY, i);
        num += v * w;
        den += w;
    });
    return den ? num / den : null;
}

/** Độ lệch chuẩn (mẫu) — dùng để nới khoảng khi kết quả trồi sụt nhiều. */
function stdDev(values) {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
    return Math.sqrt(variance);
}

/**
 * Độ chính xác từng Part, gộp mọi bài, có trọng số theo độ mới.
 * @returns {Map<number, {correct:number, total:number, accuracy:number}>}
 */
function partAccuracy(attempts) {
    const acc = new Map();
    attempts.forEach((a, i) => {
        const w = Math.pow(DECAY, i);
        for (const p of a.partScores || []) {
            const part = Number(p.partNumber);
            if (!PART_COUNTS[part] || !(p.totalQuestions > 0)) continue;
            if (!acc.has(part)) acc.set(part, { correct: 0, total: 0 });
            const cur = acc.get(part);
            cur.correct += (p.correctAnswers || 0) * w;
            cur.total += p.totalQuestions * w;
        }
    });
    for (const v of acc.values()) v.accuracy = v.total ? v.correct / v.total : 0;
    return acc;
}

/**
 * Chiếu độ chính xác từng Part lên số câu chuẩn của đề đầy đủ → số câu đúng ước
 * tính của một section, rồi quy đổi qua bảng ETS.
 * Part chưa có dữ liệu: mượn độ chính xác TRUNG BÌNH của các Part đã có trong
 * cùng section — đoán bằng số liệu cùng kỹ năng còn hơn coi như 0 điểm.
 * @returns {{ score:number|null, covered:number, missing:number[] }}
 */
function projectSection(accMap, parts, section) {
    const known = parts.filter(p => accMap.has(p));
    if (!known.length) return { score: null, covered: 0, missing: parts.slice() };

    const knownQuestions = known.reduce((s, p) => s + PART_COUNTS[p], 0);
    const totalQuestions = parts.reduce((s, p) => s + PART_COUNTS[p], 0);
    // Bình quân theo SỐ CÂU chứ không theo số Part: Part 7 (54 câu) phải nặng
    // hơn Part 6 (16 câu) khi dùng để đoán phần còn thiếu.
    const fallback = known.reduce((s, p) => s + accMap.get(p).accuracy * PART_COUNTS[p], 0) / knownQuestions;

    let rawCorrect = 0;
    for (const p of parts) {
        const a = accMap.has(p) ? accMap.get(p).accuracy : fallback;
        rawCorrect += a * PART_COUNTS[p];
    }

    return {
        score: convertToToeicScore(section, Math.round(rawCorrect)),
        covered: knownQuestions / totalQuestions,
        missing: parts.filter(p => !accMap.has(p)),
    };
}

/**
 * @param {Array} attempts  bài ĐÃ HOÀN THÀNH, MỚI NHẤT TRƯỚC. Mỗi phần tử:
 *        { testType, totalScore, listeningScore, readingScore, partScores[] }
 * @param {number} [targetScore] mục tiêu người dùng đặt (0/undefined = chưa đặt)
 * @returns {object|null} null khi chưa có dữ liệu nào dùng được
 */
function predictToeicScore(attempts = [], targetScore = 0) {
    const done = (attempts || []).filter(a => a && Array.isArray(a.partScores) && a.partScores.length);
    if (!done.length) return null;

    const fullTests = done.filter(a => a.testType === 'full-test' || a.testType === 'full');
    const fullScores = fullTests
        .map(a => Number(a.totalScore))
        .filter(n => Number.isFinite(n) && n > 0);

    let mid, listening = null, reading = null, basis, confidence, coverage = 1, missingParts = [];

    if (fullScores.length) {
        // Có đề đầy đủ → dùng thẳng, đây là dữ liệu sát nhất.
        mid = weightedMean(fullScores);
        listening = Math.round(weightedMean(fullTests.map(a => Number(a.listeningScore) || 0)));
        reading = Math.round(weightedMean(fullTests.map(a => Number(a.readingScore) || 0)));
        basis = 'full-test';
        confidence = fullScores.length >= 3 ? 'cao' : (fullScores.length === 2 ? 'trung-binh' : 'thap');
    } else {
        // Chỉ có mini test → chiếu độ chính xác từng Part lên đề 200 câu.
        const accMap = partAccuracy(done);
        const L = projectSection(accMap, LISTENING_PARTS, 'listening');
        const R = projectSection(accMap, READING_PARTS, 'reading');
        if (L.score === null && R.score === null) return null;

        listening = L.score;
        reading = R.score;
        coverage = (L.covered + R.covered) / 2;
        missingParts = [...L.missing, ...R.missing];

        // Thiếu hẳn một section thì KHÔNG đoán bừa nửa còn lại — báo thiếu.
        if (L.score === null || R.score === null) {
            return {
                enough: false,
                reason: L.score === null
                    ? 'Chưa có dữ liệu phần Nghe (Part 1-4)'
                    : 'Chưa có dữ liệu phần Đọc (Part 5-7)',
                basis: 'mini-test',
                attemptsUsed: done.length,
                listening, reading, coverage,
                missingParts,
                target: targetScore || null,
            };
        }

        mid = L.score + R.score;
        basis = 'mini-test';
        // Suy từ mini test luôn kém chắc hơn: chưa từng làm liên tục 2 tiếng.
        confidence = coverage >= 0.8 ? 'trung-binh' : 'thap';
    }

    const spread = Math.max(
        SPREAD_BY_SAMPLES[fullScores.length] || SPREAD_FLOOR,
        Math.round(stdDev(fullScores)),
        basis === 'mini-test' ? 70 : 0,
    );

    const midScore = clampScore(round5(mid));
    const result = {
        enough: true,
        basis,                       // nguồn suy ra: 'full-test' | 'mini-test'
        confidence,                  // 'cao' | 'trung-binh' | 'thap'
        attemptsUsed: basis === 'full-test' ? fullScores.length : done.length,
        predicted: {
            low: clampScore(round5(mid - spread)),
            mid: midScore,
            high: clampScore(round5(mid + spread)),
        },
        listening: listening === null ? null : clampScore(round5(listening)),
        reading: reading === null ? null : clampScore(round5(reading)),
        coverage: Math.round(coverage * 100) / 100,
        missingParts,
        // Điểm trung bình THÔ của các đề đầy đủ (không trọng số) — con số người
        // dùng tự cộng trừ kiểm chứng được, khác với `predicted.mid` có trọng số.
        average: fullScores.length
            ? round5(fullScores.reduce((a, b) => a + b, 0) / fullScores.length)
            : null,
        best: fullScores.length ? Math.max(...fullScores) : null,
        target: targetScore || null,
    };

    if (targetScore > 0) {
        result.gap = Math.max(0, round5(targetScore - midScore));
        // "Đạt" khi mục tiêu nằm trong tầm với, không đòi mid ≥ target: mục tiêu
        // nằm giữa khoảng ước lượng nghĩa là đã có cơ hội thật.
        result.reachedTarget = midScore >= targetScore;
        result.withinReach = result.predicted.high >= targetScore;
    }

    return result;
}

module.exports = {
    predictToeicScore,
    partAccuracy,
    projectSection,
    weightedMean,
    PART_COUNTS,
};
