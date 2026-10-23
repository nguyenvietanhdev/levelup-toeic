/**
 * Kiểu chấm của bài viết: Giao tiếp, TOEIC, IELTS (tiếng Anh) và HSK (tiếng Trung).
 * Chỉ kiểm phần thuần (chọn tiêu chí, điểm tổng) — không gọi AI.
 */
const es = require('../services/essayGrader');

describe('chọn kiểu chấm theo ngôn ngữ', () => {
    test('tiếng Anh: Giao tiếp, TOEIC, IELTS', () => {
        expect(es.RUBRICS_BY_LANG.en).toEqual(['giaotiep', 'toeic', 'ielts']);
        expect(es.chuanHoaRubric('toeic', 'en')).toBe('toeic');
        expect(es.chuanHoaRubric('ielts', 'en')).toBe('ielts');
    });

    test('tiếng Trung: Giao tiếp, HSK; chọn TOEIC/IELTS thì rơi về mặc định', () => {
        expect(es.RUBRICS_BY_LANG.zh).toEqual(['giaotiep', 'hsk']);
        expect(es.chuanHoaRubric('toeic', 'zh')).toBe('hsk');
        expect(es.chuanHoaRubric('ielts', 'zh')).toBe('hsk');
    });

    test('mã lạ, rỗng, hoặc không phải chuỗi → mặc định của ngôn ngữ', () => {
        expect(es.chuanHoaRubric('constructor', 'en')).toBe('ielts');
        expect(es.chuanHoaRubric(undefined, 'en')).toBe('ielts');
        expect(es.chuanHoaRubric({ toString: () => 'toeic' }, 'en')).toBe('ielts');
        expect(es.chuanHoaRubric(undefined, 'zh')).toBe('hsk');
    });
});

describe('tiêu chí của từng kiểu chấm', () => {
    test('Giao tiếp: rõ ý, tự nhiên, đúng ngữ cảnh, ngữ pháp', () => {
        expect(es.criteriaFor('en', 'giaotiep').map((c) => c.key))
            .toEqual(['ro_y', 'tu_nhien', 'dung_ngu_canh', 'ngu_phap']);
    });

    test('TOEIC: ngữ pháp, mạch lạc, từ vựng, bám đề', () => {
        expect(es.criteriaFor('en', 'toeic').map((c) => c.key))
            .toEqual(['ngu_phap', 'mach_lac', 'von_tu', 'lien_quan']);
    });

    test('IELTS giữ nguyên bốn khoá cũ (bài đã chấm trước đó vẫn đọc được)', () => {
        expect(es.criteriaFor('en', 'ielts').map((c) => c.key))
            .toEqual(['taskResponse', 'coherence', 'lexical', 'grammar']);
    });

    test('HSK giữ nguyên khoá characters', () => {
        expect(es.criteriaFor('zh', 'hsk').map((c) => c.key)).toContain('characters');
    });

    test('không truyền kiểu chấm thì giữ hành vi cũ theo ngôn ngữ', () => {
        expect(es.criteriaFor('en').map((c) => c.key)).toContain('lexical');
        expect(es.criteriaFor('zh').map((c) => c.key)).toContain('characters');
    });
});

describe('điểm tổng theo kiểu chấm', () => {
    test('TOEIC lấy trung bình bốn tiêu chí TOEIC, không lẫn khoá IELTS', () => {
        const scores = { ngu_phap: 6, mach_lac: 6, von_tu: 8, lien_quan: 8 };
        expect(es.overallBand(scores, 'en', 'toeic')).toBe(7);
    });

    test('Giao tiếp đọc đúng khoá ro_y, tu_nhien...', () => {
        const scores = { ro_y: 5, tu_nhien: 5, dung_ngu_canh: 5, ngu_phap: 5 };
        expect(es.overallBand(scores, 'en', 'giaotiep')).toBe(5);
    });
});
