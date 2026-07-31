/**
 * Test cases cho PartSelector.getWordsForPractice()
 * và GameLogic.getWordsByPart() (level filter logic)
 *
 * Chạy: npm test
 */

// ===================================
// MOCK DATA
// ===================================

const MOCK_VOCAB = [
    { en: 'apple',    vn: 'táo',     part: 'Part1', level: 'A1' },
    { en: 'banana',   vn: 'chuối',   part: 'Part1', level: 'A1' },
    { en: 'cherry',   vn: 'anh đào', part: 'Part1', level: 'A2' },
    { en: 'dog',      vn: 'chó',     part: 'Part1', level: 'B1' },
    { en: 'elephant', vn: 'voi',     part: 'Part1', level: 'B2' },
    { en: 'fox',      vn: 'cáo',     part: 'Part2', level: 'A1' },
    { en: 'grape',    vn: 'nho',     part: 'Part2', level: 'A2' },
    { en: 'horse',    vn: 'ngựa',    part: 'Part2', level: 'B1' },
    { en: 'igloo',    vn: 'lều băng',part: 'Part2', level: 'C1' },
    { en: 'jacket',   vn: 'áo khoác',part: 'Part2', level: 'C2' },
];

// ===================================
// STUB GameLogic
// ===================================

const GameState = { state: { settings: {} } };
const Notification = { show: jest.fn() };
global.GameState = GameState;
global.Notification = Notification;

// GameLogic stub — extracted core logic to test directly without DOM
// NOTE: levelFilter is read from GameState.state.settings at call time (not stored here)
function makeGameLogic(vocab) {
    return {
        vocabularyData: vocab,
        getWordsByPart(part) {
            const settings = GameState.state?.settings || {};
            const lf = settings.levelFilter;
            let words = this.vocabularyData.filter(w => w.part === part);
            if (lf && Array.isArray(lf) && lf.length > 0) {
                words = words.filter(w => w.level && lf.includes(w.level));
            }
            return words;
        },
    };
}

// Utils stub — deterministic "shuffle" = identity (để test sequential dễ hơn)
function makeUtils(shuffle = false) {
    return {
        shuffleArray(arr) {
            return shuffle ? [...arr].sort(() => Math.random() - 0.5) : [...arr];
        },
        randomSample(array, n) {
            const shuffled = this.shuffleArray(array);
            return shuffled.slice(0, Math.min(n, array.length));
        },
    };
}

// Storage stub
const Storage = { get: jest.fn().mockResolvedValue(null), set: jest.fn(), remove: jest.fn() };
global.Storage = Storage;

// ===================================
// HELPER: build PartSelector with injected deps
// ===================================

function buildPartSelector({ vocab = MOCK_VOCAB, settings = {}, retryWords = null } = {}) {
    GameState.state.settings = {
        randomQuestions: true,
        questionsPerSession: 10,
        selectedPart: null,
        levelFilter: null,
        ...settings,
    };

    const logic = makeGameLogic(vocab);
    const utils = makeUtils(false); // deterministic

    global.GameLogic = logic;
    global.Utils = utils;

    // Inline the pure logic of getWordsForPractice (no DOM, no Storage calls)
    const ps = {
        retryWords,
        selectedPart: settings.selectedPart || null,

        async getWordsForPractice(requestedCount) {
            // Retry mode
            if (this.retryWords && this.retryWords.length > 0) {
                const words = [...this.retryWords];
                this.retryWords = null;
                return words;
            }

            const s = GameState.state.settings;
            const isRandom = s.randomQuestions !== false;
            this.selectedPart = s.selectedPart || null;

            let pool;
            if (this.selectedPart) {
                pool = GameLogic.getWordsByPart(this.selectedPart);
            } else {
                const lf = s.levelFilter;
                pool = (lf && lf.length > 0)
                    ? GameLogic.vocabularyData.filter(w => w.level && lf.includes(w.level))
                    : [...GameLogic.vocabularyData];
            }

            const rawQPS = s.questionsPerSession;
            const isAutoMode = rawQPS === 'auto';
            const limit = isAutoMode ? null : (rawQPS || requestedCount || 20);
            const effectiveLimit = limit !== null ? limit : pool.length;

            let result;
            if (isRandom) {
                result = Utils.randomSample(pool, Math.min(effectiveLimit, pool.length));
            } else {
                result = pool.slice(0, effectiveLimit);
            }
            return result;
        },
    };
    return ps;
}

// ===================================
// TEST SUITE: getWordsByPart level filter
// ===================================

describe('GameLogic.getWordsByPart()', () => {
    let logic;
    beforeEach(() => {
        logic = makeGameLogic(MOCK_VOCAB);
    });

    test('trả về tất cả từ trong part khi không có levelFilter', () => {
        GameState.state.settings.levelFilter = null;
        const words = logic.getWordsByPart('Part1');
        expect(words).toHaveLength(5);
        expect(words.every(w => w.part === 'Part1')).toBe(true);
    });

    test('lọc đúng theo levelFilter = [A1]', () => {
        GameState.state.settings.levelFilter = ['A1'];
        const words = logic.getWordsByPart('Part1');
        expect(words).toHaveLength(2); // apple, banana
        expect(words.every(w => w.level === 'A1')).toBe(true);
    });

    test('lọc đúng theo levelFilter = [A1, A2]', () => {
        GameState.state.settings.levelFilter = ['A1', 'A2'];
        const words = logic.getWordsByPart('Part1');
        expect(words).toHaveLength(3); // apple, banana, cherry
        expect(words.map(w => w.en)).toEqual(expect.arrayContaining(['apple', 'banana', 'cherry']));
    });

    test('trả về [] khi levelFilter không khớp từ nào trong part', () => {
        GameState.state.settings.levelFilter = ['C2'];
        const words = logic.getWordsByPart('Part1');
        expect(words).toHaveLength(0);
    });

    test('không lọc khi levelFilter là mảng rỗng', () => {
        GameState.state.settings.levelFilter = [];
        const words = logic.getWordsByPart('Part2');
        expect(words).toHaveLength(5);
    });

    test('trả về [] khi part không tồn tại', () => {
        GameState.state.settings.levelFilter = null;
        const words = logic.getWordsByPart('PartX');
        expect(words).toHaveLength(0);
    });
});

// ===================================
// TEST SUITE: getWordsForPractice
// ===================================

describe('PartSelector.getWordsForPractice()', () => {

    // ---- Retry mode ----

    test('retry mode: trả về retryWords và clear sau khi lấy', async () => {
        const retryList = [MOCK_VOCAB[0], MOCK_VOCAB[1]];
        const ps = buildPartSelector({ retryWords: retryList });

        const result = await ps.getWordsForPractice(10);

        expect(result).toEqual(retryList);
        expect(ps.retryWords).toBeNull();
    });

    test('retry mode: không dùng retryWords lần 2', async () => {
        const ps = buildPartSelector({ retryWords: [MOCK_VOCAB[0]] });
        await ps.getWordsForPractice(10); // lần 1 — dùng retry
        const result2 = await ps.getWordsForPractice(10); // lần 2 — lấy từ pool
        expect(result2.length).toBeGreaterThan(0);
        expect(result2).not.toEqual([MOCK_VOCAB[0]]);
    });

    // ---- random-all mode ----

    test('random-all: không selectedPart, lấy từ toàn bộ vocab', async () => {
        const ps = buildPartSelector({ settings: { randomQuestions: true, questionsPerSession: 5 } });
        const result = await ps.getWordsForPractice(5);
        expect(result).toHaveLength(5);
    });

    test('random-all: QPS > pool.length → trả về toàn bộ pool', async () => {
        const ps = buildPartSelector({ settings: { randomQuestions: true, questionsPerSession: 100 } });
        const result = await ps.getWordsForPractice(100);
        expect(result).toHaveLength(MOCK_VOCAB.length); // 10
    });

    test('random-all với levelFilter [A1]: chỉ lấy từ A1', async () => {
        const ps = buildPartSelector({
            settings: { randomQuestions: true, questionsPerSession: 10, levelFilter: ['A1'] },
        });
        const result = await ps.getWordsForPractice(10);
        // A1 words: apple, banana (Part1), fox (Part2) = 3 words
        expect(result).toHaveLength(3);
        expect(result.every(w => w.level === 'A1')).toBe(true);
    });

    test('random-all với levelFilter không khớp → trả về []', async () => {
        const ps = buildPartSelector({
            settings: { randomQuestions: true, questionsPerSession: 10, levelFilter: ['Z9'] },
        });
        const result = await ps.getWordsForPractice(10);
        expect(result).toHaveLength(0);
    });

    // ---- random-part mode ----

    test('random-part: selectedPart=Part1, trả về từ Part1', async () => {
        const ps = buildPartSelector({
            settings: { randomQuestions: true, questionsPerSession: 3, selectedPart: 'Part1' },
        });
        const result = await ps.getWordsForPractice(3);
        expect(result).toHaveLength(3);
        expect(result.every(w => w.part === 'Part1')).toBe(true);
    });

    test('random-part: selectedPart=Part1 với levelFilter [B1,B2]', async () => {
        const ps = buildPartSelector({
            settings: {
                randomQuestions: true,
                questionsPerSession: 10,
                selectedPart: 'Part1',
                levelFilter: ['B1', 'B2'],
            },
        });
        const result = await ps.getWordsForPractice(10);
        // Part1 B1+B2: dog, elephant = 2 words
        expect(result).toHaveLength(2);
        expect(result.every(w => ['B1', 'B2'].includes(w.level))).toBe(true);
    });

    test('random-part: pool nhỏ hơn QPS → trả về toàn bộ pool', async () => {
        const ps = buildPartSelector({
            settings: { randomQuestions: true, questionsPerSession: 50, selectedPart: 'Part2' },
        });
        const result = await ps.getWordsForPractice(50);
        expect(result).toHaveLength(5); // Part2 có 5 từ
        expect(result.every(w => w.part === 'Part2')).toBe(true);
    });

    // ---- sequential mode ----

    test('sequential: lấy N từ đầu tiên của pool (không shuffle)', async () => {
        const ps = buildPartSelector({
            settings: { randomQuestions: false, questionsPerSession: 3, selectedPart: 'Part1' },
        });
        const result = await ps.getWordsForPractice(3);
        const expected = MOCK_VOCAB.filter(w => w.part === 'Part1').slice(0, 3);
        expect(result).toEqual(expected);
    });

    test('sequential: QPS vượt pool → trả về toàn bộ pool theo thứ tự', async () => {
        const ps = buildPartSelector({
            settings: { randomQuestions: false, questionsPerSession: 100, selectedPart: 'Part1' },
        });
        const result = await ps.getWordsForPractice(100);
        const expected = MOCK_VOCAB.filter(w => w.part === 'Part1');
        expect(result).toEqual(expected);
    });

    // ---- QPS = 'auto' mode ----

    test("QPS='auto': trả về toàn bộ pool không giới hạn", async () => {
        const ps = buildPartSelector({
            settings: { randomQuestions: true, questionsPerSession: 'auto' },
        });
        const result = await ps.getWordsForPractice(5); // requestedCount bị bỏ qua
        expect(result).toHaveLength(MOCK_VOCAB.length);
    });

    test("QPS='auto' với selectedPart: trả về toàn bộ part", async () => {
        const ps = buildPartSelector({
            settings: { randomQuestions: false, questionsPerSession: 'auto', selectedPart: 'Part2' },
        });
        const result = await ps.getWordsForPractice(5);
        expect(result).toHaveLength(5); // Part2 có 5 từ
    });

    // ---- Edge cases ----

    test('pool rỗng (part không có từ nào): trả về []', async () => {
        const ps = buildPartSelector({
            vocab: MOCK_VOCAB,
            settings: { randomQuestions: true, questionsPerSession: 10, selectedPart: 'PartX' },
        });
        const result = await ps.getWordsForPractice(10);
        expect(result).toHaveLength(0);
    });

    test('vocab rỗng hoàn toàn: trả về []', async () => {
        const ps = buildPartSelector({
            vocab: [],
            settings: { randomQuestions: true, questionsPerSession: 10 },
        });
        const result = await ps.getWordsForPractice(10);
        expect(result).toHaveLength(0);
    });

    test('QPS không set → fallback về requestedCount', async () => {
        const ps = buildPartSelector({
            settings: { randomQuestions: true, questionsPerSession: undefined, selectedPart: 'Part1' },
        });
        const result = await ps.getWordsForPractice(3); // requestedCount = 3
        expect(result).toHaveLength(3);
    });
});
