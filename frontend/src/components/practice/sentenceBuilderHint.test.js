/** Chạy THẬT logic gợi ý — test đọc chữ ở trên không bắt được lỗi luồng. */
import { describe, test, expect, beforeEach } from 'vitest';

// Bản sao rút gọn của luồng: `selectPhrase` + `showHint` như trong mode.
function taoMode(phrases) {
    return {
        selectedWords: [],
        hintUsed: false,
        questions: [{ correctPhrases: phrases }],
        currentIndex: 0,
        nut: phrases.map((p) => ({ dataset: { phrase: p }, disabled: false, classList: { add() {}, remove() {} } })),
        selectPhrase(phrase, btn) {
            if (btn.disabled) return;
            this.selectedWords.push(phrase);
            btn.disabled = true;
        },
        clearSentence() {
            this.selectedWords = [];
            this.nut.forEach((b) => { b.disabled = false; });
        },
        showHint() {
            const question = this.questions[this.currentIndex];
            if (!question || this.hintUsed) return;
            const cumDau = (question.correctPhrases || []).slice(0, 2);
            if (this.selectedWords.length) this.clearSentence();
            for (const cum of cumDau) {
                const btn = this.nut.find((b) => b.dataset.phrase === cum && !b.disabled);
                if (btn) this.selectPhrase(cum, btn);
            }
            this.hintUsed = true;
        },
    };
}

describe('gợi ý chạy thật', () => {
    test('xếp đúng 2 cụm đầu, đúng thứ tự', () => {
        const m = taoMode(['She', 'is', 'reading', 'a book']);
        m.showHint();
        expect(m.selectedWords).toEqual(['She', 'is']);
    });

    test('khoá luôn nút gốc — không bấm lại được', () => {
        const m = taoMode(['She', 'is', 'reading']);
        m.showHint();
        expect(m.nut.filter((b) => b.disabled).map((b) => b.dataset.phrase)).toEqual(['She', 'is']);
    });

    test('câu có cụm LẶP vẫn xếp đủ hai', () => {
        // "the" xuất hiện hai lần: không lọc `!disabled` thì cụm thứ hai trượt.
        const m = taoMode(['the', 'the', 'end']);
        m.showHint();
        expect(m.selectedWords).toEqual(['the', 'the']);
    });

    test('đang xếp dở thì gợi ý dọn sạch, không nối đuôi', () => {
        const m = taoMode(['She', 'is', 'reading']);
        m.selectPhrase('reading', m.nut[2]);
        m.showHint();
        expect(m.selectedWords).toEqual(['She', 'is']);
    });

    test('câu chỉ có 1 cụm không vỡ', () => {
        const m = taoMode(['Hello']);
        expect(() => m.showHint()).not.toThrow();
        expect(m.selectedWords).toEqual(['Hello']);
    });

    test('bấm gợi ý lần hai không xếp thêm', () => {
        const m = taoMode(['She', 'is', 'reading']);
        m.showHint();
        m.showHint();
        expect(m.selectedWords).toEqual(['She', 'is']);
    });
});
