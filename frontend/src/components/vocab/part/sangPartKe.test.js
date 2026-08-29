/**
 * "Học tiếp" phải sang PART KẾ TIẾP khi học hết part hiện tại.
 *
 * Trước đây `offset % pool.length` cuộn vòng về đầu chính part đó, nên bấm
 * "Học tiếp" mãi vẫn quanh quẩn một part — mà không có gì báo, vì thẻ vẫn hiện
 * bình thường.
 *
 * Chỉ áp dụng khi đang khoá vào MỘT part ("Tuần tự" và "Ngẫu nhiên 1 Part").
 * "Ngẫu nhiên tất cả" thì kho là một khối, không có part nào để chuyển sang.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('@lib/storage.js', () => ({ Storage: { get: vi.fn(), set: vi.fn() } }));
vi.mock('@game/state.js', () => ({
    GameState: { state: { settings: {} }, save: vi.fn() },
}));
vi.mock('@game/gameLogic.js', () => ({
    GameLogic: { vocabularyData: [], getWordsByPart: vi.fn() },
}));
vi.mock('@lib/utils.js', () => ({
    Utils: { randomSample: (pool, n) => pool.slice(0, n) },
}));
vi.mock('@game/eventBus.js', () => ({ EventBus: { emit: vi.fn(), on: vi.fn() }, GameEvents: {} }));
vi.mock('@ui/Toaster.jsx', () => ({ Notification: { show: vi.fn(), success: vi.fn() } }));
vi.mock('@ui/Modal.jsx', () => ({ Modal: { open: vi.fn(), close: vi.fn() } }));
vi.mock('../dichTenDe.js', () => ({ dichTenDe: vi.fn() }));
vi.mock('@lib/levelBands.js', () => ({ toBand: () => 'A' }));
vi.mock('@lib/scrollMemory.js', () => ({ theoDoiCuon: vi.fn() }));

const { PartSelector } = await import('./partSelector.js');
const { GameState } = await import('@game/state.js');
const { GameLogic } = await import('@game/gameLogic.js');
const { Storage } = await import('@lib/storage.js');

/** Kho giả: `n` từ thuộc `part`. */
const tuCua = (part, n) =>
    Array.from({ length: n }, (_, i) => ({ en: `${part}-${i}`, part }));

beforeEach(() => {
    vi.clearAllMocks();
    GameState.state.settings = { questionsPerSession: 5, randomQuestions: false };
    PartSelector.retryWords = null;
    PartSelector.parts = ['Part 1', 'Part 2', 'Part 3'];
    PartSelector.selectedPart = null;
    GameLogic.vocabularyData = [];
    GameLogic.getWordsByPart.mockImplementation((p) => tuCua(p, 12));
});

describe('tuần tự: hết part thì trả rỗng, KHÔNG cuộn vòng', () => {
    test('offset trong phạm vi vẫn trả từ', async () => {
        GameState.state.settings.selectedPart = 'Part 1';
        const w = await PartSelector.getWordsForPractice(5, 5);
        expect(w).toHaveLength(5);
        expect(w[0].en).toBe('Part 1-5');
    });

    test('offset vượt kho → RỖNG (trước đây quay về đầu)', async () => {
        GameState.state.settings.selectedPart = 'Part 1';
        expect(await PartSelector.getWordsForPractice(5, 12)).toHaveLength(0);
        expect(await PartSelector.getWordsForPractice(5, 40)).toHaveLength(0);
    });

    test('lô CUỐI ngắn hơn `count` vẫn trả về, không bị coi là hết', async () => {
        // 12 từ, offset 10 → còn đúng 2. Trả rỗng ở đây là mất hai từ cuối.
        GameState.state.settings.selectedPart = 'Part 1';
        expect(await PartSelector.getWordsForPractice(5, 10)).toHaveLength(2);
    });
});

describe('ngẫu nhiên 1 part: cũng phải hết được', () => {
    beforeEach(() => { GameState.state.settings.randomQuestions = true; });

    test('đi hết một lượt cả part → RỖNG', async () => {
        GameState.state.settings.selectedPart = 'Part 1';
        expect(await PartSelector.getWordsForPractice(5, 12)).toHaveLength(0);
    });

    test('chưa hết thì vẫn bốc bình thường', async () => {
        GameState.state.settings.selectedPart = 'Part 1';
        expect(await PartSelector.getWordsForPractice(5, 5)).toHaveLength(5);
    });

    test('NGẪU NHIÊN TẤT CẢ thì bốc mãi, không bao giờ rỗng', async () => {
        // Không khoá part nào — không có part nào để chuyển sang, nên "hết"
        // là vô nghĩa ở đây.
        GameState.state.settings.selectedPart = null;
        GameLogic.vocabularyData = tuCua('Part 1', 12);
        expect(await PartSelector.getWordsForPractice(5, 999)).toHaveLength(5);
    });
});

describe('sangPartKe', () => {
    test('chuyển sang part liền sau theo thứ tự', async () => {
        GameState.state.settings.selectedPart = 'Part 1';
        expect(await PartSelector.sangPartKe()).toBe('Part 2');
        expect(GameState.state.settings.selectedPart).toBe('Part 2');
        expect(Storage.set).toHaveBeenCalledWith('selectedPart', 'Part 2');
    });

    test('part CUỐI → null, KHÔNG quay về part đầu', async () => {
        // Cuộn về đầu là vòng lặp không lối ra: học hết cả kho rồi lại từ đầu.
        GameState.state.settings.selectedPart = 'Part 3';
        expect(await PartSelector.sangPartKe()).toBeNull();
        expect(GameState.state.settings.selectedPart).toBe('Part 3');
    });

    test('ngẫu nhiên tất cả (không có part) → null', async () => {
        GameState.state.settings.selectedPart = null;
        expect(await PartSelector.sangPartKe()).toBeNull();
    });

    test('dựng danh sách từ kho khi chưa mở modal chọn part', async () => {
        // `this.parts` chỉ được điền lúc mở modal; vào thẳng luyện tập từ trang
        // chủ thì nó rỗng, và không có danh sách thì không biết part nào sau.
        PartSelector.parts = [];
        GameLogic.vocabularyData = [...tuCua('Part 1', 2), ...tuCua('Part 2', 2)];
        GameState.state.settings.selectedPart = 'Part 1';
        expect(await PartSelector.sangPartKe()).toBe('Part 2');
    });

    test('part không nằm trong danh sách → null', async () => {
        GameState.state.settings.selectedPart = 'Part X';
        expect(await PartSelector.sangPartKe()).toBeNull();
    });
});

describe('"Học tiếp" của Flashcard gọi tới nó', () => {
    // Neo vào mã nguồn: dựng cả `Flashcard.continueNextBatch` cần theo cả
    // `PracticeManager`, `Notification`, DOM của thẻ — nhiều hơn thứ đang kiểm.
    const src = readFileSync(
        join(__dirname, '..', '..', 'practice', 'modes', 'flashcard.js'), 'utf8');

    test('hết từ thì thử chuyển part TRƯỚC khi báo "không tìm thấy"', () => {
        // Cắt riêng thân `continueNextBatch`: `start()` phía trên cũng có câu
        // cảnh báo y hệt, `indexOf` trần bắt trúng cái đó và so sai chỗ.
        const iHam = src.indexOf('async continueNextBatch()');
        expect(iHam).toBeGreaterThan(-1);
        const than = src.slice(iHam, src.indexOf('async loadWords()', iHam));

        const iChuyen = than.indexOf('sangPartKe()');
        expect(iChuyen).toBeGreaterThan(-1);
        expect(iChuyen).toBeLessThan(than.indexOf('Không tìm thấy từ vựng phù hợp'));
    });

    test('part mới bắt đầu từ đầu, không mang con trỏ part cũ', () => {
        // Giữ `batchOffset` cũ là part mới bị bỏ qua mất mấy chục từ đầu.
        const i = src.indexOf('sangPartKe()');
        expect(src.slice(i, i + 400)).toMatch(/this\.batchOffset = 0/);
    });

    test('nạp lại từ sau khi đã chuyển part', () => {
        const i = src.indexOf('sangPartKe()');
        expect(src.slice(i, i + 400)).toMatch(/await this\.loadWords\(\)/);
    });
});
