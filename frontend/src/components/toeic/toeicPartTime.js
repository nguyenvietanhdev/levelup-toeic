// Thời gian mỗi câu (giây) cho bài thi TOEIC.
//
// Part 1-4 (Nghe): đặt TAY theo từng Part — nhịp do audio quyết định, chia đều
//   thời gian đề ra không có ý nghĩa gì.
// Part 5-7 (Đọc): TỰ TÍNH theo từng đề — lấy thời gian của chính đề đó chia đều
//   cho số câu, rồi TRỪ thời gian chuyển câu (khoảng chết giữa hai câu) để tổng
//   thời gian thực tế không vượt quá thời gian đề cho.
//
// Part nhóm (3/4/6/7) hiển thị CẢ NHÓM trên một màn → thời gian màn đó
// = số câu trong nhóm × thời gian mỗi câu (xem getToeicScreenTime).
import { GameState } from '@game/state.js';

// Part Đọc: thời gian mỗi câu suy ra từ đề, không cho đặt tay.
export const AUTO_TIME_PARTS = [5, 6, 7];

// ── FULL TEST: giờ chuẩn ETS, chia 2 chặng, KHÔNG theo settings ──────────────
// Thi thật tính giờ riêng từng phần: Nghe 45' (Part 1-4) rồi Đọc 75' (Part 5-7),
// không phải một đồng hồ tổng. Đây là con số cố định của kỳ thi nên mọi lựa
// chọn thời gian ở popup / Cài đặt đều không áp lên Full Test.
export const FULL_TEST_LISTENING_SECONDS = 45 * 60;
export const FULL_TEST_READING_SECONDS = 75 * 60;

/** Đề có phải Full Test không (backend dùng cả 'full' lẫn 'full-test'). */
export function isFullTestType(test) {
    return test?.testType === 'full' || test?.testType === 'full-test';
}

// Đề TOEIC luôn 200 câu. Mini test tuy chỉ lấy một Part nhưng số câu vẫn đánh
// theo dải chuẩn (Part 3 = 32-70…) nên mẫu số phải là 200, không phải số câu
// của riêng Part — có vậy người học mới quen mặt số câu như lúc thi thật.
export const TOEIC_TOTAL_QUESTIONS = 200;

/** Số câu THẬT theo chuẩn TOEIC của một câu hỏi (fallback về vị trí nếu thiếu). */
export function toeicQuestionNumber(q, fallbackIndex) {
    return q?.globalQuestionNumber ?? q?.questionNumber ?? (fallbackIndex + 1);
}

export const TOEIC_PART_TIMES = [
    { id: 1, name: 'Part 1 — Mô tả tranh',     def: 25 },
    { id: 2, name: 'Part 2 — Hỏi & đáp',       def: 20 },
    { id: 3, name: 'Part 3 — Hội thoại',       def: 30 },
    { id: 4, name: 'Part 4 — Bài nói',         def: 30 },
    { id: 5, name: 'Part 5 — Hoàn thành câu',  def: 25, auto: true },
    { id: 6, name: 'Part 6 — Hoàn thành đoạn', def: 30, auto: true },
    { id: 7, name: 'Part 7 — Đọc hiểu',        def: 45, auto: true },
];

const DEFAULTS = Object.fromEntries(TOEIC_PART_TIMES.map(p => [p.id, p.def]));

// Chặn dưới: dù đề có eo hẹp đến đâu cũng phải kịp đọc xong câu hỏi.
const MIN_AUTO_SECONDS = 5;
const DEFAULT_TRANSITION = 1; // giây

/** Đồng hồ từng câu cho TOEIC có đang bật không. */
export function isToeicQuestionTimerOn() {
    return GameState.state?.settings?.toeicPerQuestionTimer === true;
}

/** Hết giờ một câu thì có tự nhảy sang câu kế không (mặc định CÓ). */
export function isToeicAutoAdvanceOn() {
    return GameState.state?.settings?.toeicAutoAdvance !== false;
}

/** Khoảng chết giữa hai câu, tính bằng giây. */
export function getToeicTransition() {
    const v = GameState.state?.settings?.toeicTransition;
    return (typeof v === 'number' && v >= 0) ? v : DEFAULT_TRANSITION;
}

export function isAutoTimePart(part) {
    return AUTO_TIME_PARTS.includes(Number(part));
}

export function getToeicPartTimeDefault(part) {
    return DEFAULTS[part] ?? 30;
}

// Trọng số thời gian giữa các Part Đọc. Chia ĐỀU cho mọi câu là không công
// bằng: câu Part 7 phải đọc cả một lá thư/thông báo rồi mới trả lời được, còn
// Part 5 chỉ là một câu điền chỗ trống. Nhóm câu (Part 6/7) vì thế nhận nhiều
// thời gian hơn hẳn — vừa do có nhiều câu, vừa do mỗi câu nặng hơn.
const READ_WEIGHT = { 5: 1, 6: 1.3, 7: 1.8 };

/**
 * Chia thời gian của MỘT đề cho các Part Đọc (5/6/7).
 *
 * Ngân sách = thời gian đề − thời gian các Part Nghe (đặt tay) − thời gian
 * chuyển câu, rồi chia theo trọng số:
 *      mỗi câu Part p = ngânSách × w(p) / Σ(w(part của từng câu Đọc))
 *
 * Nhờ chia theo trọng số, tổng thời gian vẫn khớp đề mà câu nặng được nhiều
 * giờ hơn. Đề chỉ có một Part Đọc (mini test) thì mọi trọng số bằng nhau →
 * quay về đúng phép chia đều như trước, không đổi gì.
 *
 * @param {number} totalSeconds THỜI GIAN THỰC của lượt làm — là con số người
 *        dùng CHỌN Ở POPUP (nguồn duy nhất), không phải totalTime của admin.
 *        null/0 = không giới hạn → không dựng bảng (nhịp từng câu tắt).
 * @param {Array}  questions danh sách câu đã dàn phẳng (mỗi câu có .part)
 * @returns {object|null} { [part]: giây mỗi câu } cho các Part Đọc
 */
export function buildToeicReadingPlan(totalSeconds, questions) {
    const total = Number(totalSeconds);
    if (!Number.isFinite(total) || total <= 0 || !Array.isArray(questions) || !questions.length) return null;

    const reading = questions.filter(q => isAutoTimePart(q.part));
    if (!reading.length) return null;

    // Phần Nghe KHÔNG bị đếm ngược (audio dẫn nhịp), nhưng vẫn phải chừa cho nó
    // một khoảng ước lượng theo CHUẨN ETS để không dồn hết tổng cho phần Đọc.
    const listeningTime = questions
        .filter(q => !isAutoTimePart(q.part))
        .reduce((sum, q) => sum + getToeicPartTimeDefault(q.part), 0);

    const transition = getToeicTransition();
    const usable = total - listeningTime - transition * reading.length;
    return splitReadingByWeight(usable, reading);
}

/** Chia một ngân sách giây cho các Part Đọc theo trọng số READ_WEIGHT. */
function splitReadingByWeight(usable, readingQuestions) {
    const weightSum = readingQuestions.reduce((sum, q) => sum + (READ_WEIGHT[q.part] || 1), 0);
    if (!weightSum) return null;
    const plan = {};
    for (const part of AUTO_TIME_PARTS) {
        const w = READ_WEIGHT[part] || 1;
        plan[part] = Math.max(MIN_AUTO_SECONDS, Math.floor((usable * w) / weightSum));
    }
    return plan;
}

/**
 * Bảng giây/câu Part Đọc cho FULL TEST: chia đúng ngân sách 75' của chặng Đọc
 * (không trừ phần Nghe — chặng Nghe có đồng hồ 45' riêng).
 */
export function buildFullTestReadingPlan(questions) {
    if (!Array.isArray(questions) || !questions.length) return null;
    const reading = questions.filter(q => isAutoTimePart(q.part));
    if (!reading.length) return null;
    const usable = FULL_TEST_READING_SECONDS - getToeicTransition() * reading.length;
    return splitReadingByWeight(usable, reading);
}

/**
 * Số giây cho MỘT câu của một Part ĐỌC (5·6·7). Part Nghe không dùng hàm này —
 * nhịp của nó do audio quyết định, không đếm ngược.
 * @param {number} part
 * @param {object} [plan] bảng giờ Part Đọc do buildToeicReadingPlan dựng
 */
export function getToeicPartTime(part, plan) {
    // Không dựng được bảng (thiếu dữ liệu) → rơi về mặc định chuẩn.
    return plan?.[part] ?? getToeicPartTimeDefault(part);
}

/**
 * Số giây cho MỘT MÀN. Màn nhóm hiện nhiều câu cùng lúc nên nhân theo số câu
 * → nhóm luôn được nhiều thời gian hơn câu đơn, và với Part 6/7 còn được cộng
 * thêm nhờ trọng số trong buildToeicReadingPlan.
 * @param {number} part
 * @param {number} questionCount số câu đang hiển thị trên màn (1 với Part đơn)
 * @param {object} [plan] bảng giờ Part Đọc
 */
export function getToeicScreenTime(part, questionCount = 1, plan) {
    return getToeicPartTime(part, plan) * Math.max(1, questionCount);
}

// ── Chế độ TÙY CHỈNH: mỗi Part Đọc một ngân sách phút RIÊNG (settings) ────────
// Người dùng đặt tổng thời gian cho từng Part 5·6·7; per-question = tổng Part đó
// / số câu Part đó − chuyển câu. Khác weight-split (chia một tổng theo trọng số):
// ở đây mỗi Part là con số TUYỆT ĐỐI người dùng muốn.

/** Ngân sách phút của một Part Đọc từ settings (mặc định nếu chưa đặt). */
function customPartMinutes(part) {
    const v = GameState.state?.settings?.toeicCustomPartMin?.[part];
    return (typeof v === 'number' && v > 0) ? v : ({ 5: 15, 6: 8, 7: 36 }[part] || 15);
}

/**
 * Dựng bảng giây/câu cho Part Đọc theo NGÂN SÁCH RIÊNG mỗi Part.
 * @param {Array} questions danh sách câu đã dàn phẳng (mỗi câu có .part)
 * @returns {object|null} { [part]: giây mỗi câu }
 */
export function buildCustomReadingPlan(questions) {
    if (!Array.isArray(questions) || !questions.length) return null;
    const transition = getToeicTransition();
    const plan = {};
    for (const part of AUTO_TIME_PARTS) {
        const count = questions.filter(q => Number(q.part) === part).length;
        if (!count) continue;
        const perQ = Math.floor((customPartMinutes(part) * 60) / count) - transition;
        plan[part] = Math.max(MIN_AUTO_SECONDS, perQ);
    }
    return Object.keys(plan).length ? plan : null;
}

/**
 * Tổng thời gian (giây) của chế độ TÙY CHỈNH cho một đề: cộng ngân sách các Part
 * Đọc có mặt + chừa khoảng ước lượng cho Part Nghe (chuẩn ETS). Dùng cho popup
 * để đặt đồng hồ tổng. `partCounts` = { [part]: số câu } lấy từ test.parts.
 */
export function customTotalSeconds(partCounts = {}) {
    let total = 0;
    for (const [part, count] of Object.entries(partCounts)) {
        const p = Number(part);
        if (!count) continue;
        if (AUTO_TIME_PARTS.includes(p)) total += customPartMinutes(p) * 60;
        else total += getToeicPartTimeDefault(p) * count; // Nghe: ước lượng chuẩn
    }
    return total;
}
