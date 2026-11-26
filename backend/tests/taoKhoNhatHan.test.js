/** Dựng kho từ Nhật/Hàn từ dữ liệu mở: đúng trường mặt chữ, cấp độ khớp thang trong sổ ngôn ngữ. */
const { docCsv, tuJlpt, tuNikl, boTrung } = require('../scripts/taoKhoNhatHan');
const { layNgonNgu } = require('../config/ngonNgu');

test('JLPT: mặt chữ Kanji, cách đọc vào phonetic, cấp N5…N1 thuộc thang JLPT của sổ', () => {
    const [r] = docCsv('Kanji,Reading,Level\n勉強,べんきょう,5\n');
    expect(tuJlpt(r)).toMatchObject({ ja: '勉強', phonetic: 'べんきょう', level: 'N5', part: 'N5', source: 'jlpt' });
    expect(tuJlpt({ Kanji: '', Reading: 'ああ', Level: '1' })).toMatchObject({ ja: 'ああ', phonetic: '' });
    expect(tuJlpt({ Kanji: 'x', Reading: 'x', Level: '9' })).toBeNull();
    const thang = layNgonNgu('ja').bacCapDo;
    expect([...thang.easy, ...thang.medium, ...thang.hard]).toEqual(expect.arrayContaining(['N5', 'N4', 'N3', 'N2', 'N1']));
});

test('tiếng Hàn: bỏ số đánh dấu đồng âm, từ loại, bậc A/B/C khớp thang của sổ, gốc Hán giữ để phân biệt', () => {
    expect(tuNikl('898\t가격03\t명\t價格\tB')).toMatchObject({ ko: '가격', type: 'noun', level: 'B', part: 'Trung cấp', synonyms: '價格', source: 'nikl' });
    expect(tuNikl('1\t가다\t동\t\tZ')).toBeNull();
    expect(layNgonNgu('ko').bacCapDo.medium).toEqual(['B']);
});

test('bỏ trùng theo mặt chữ + gốc Hán + Part (từ đồng âm khác gốc Hán được giữ)', () => {
    const ds = [tuNikl('1\t가구03\t명\t家口\tC'), tuNikl('2\t가구04\t명\t家具\tC'), tuNikl('3\t가구04\t명\t家具\tC')];
    expect(boTrung(ds, 'ko')).toHaveLength(2);
});

describe('bước dịch nghĩa (--dich)', () => {
    const { khoaTu, promptLo, docKetQuaLo } = require('../scripts/taoKhoNhatHan');
    test('khoá phân biệt từ đồng âm theo gốc Hán / cách đọc', () => {
        expect(khoaTu({ ko: '가구', synonyms: '家口' })).not.toBe(khoaTu({ ko: '가구', synonyms: '家具' }));
    });
    test('prompt đánh số, kèm cách đọc (Nhật) / gốc Hán (Hàn), tiếng Hàn xin thêm romaja', () => {
        const ja = promptLo('ja', [{ ja: '勉強', phonetic: 'べんきょう' }]);
        expect(ja[1].content).toBe('0\t勉強\tべんきょう');
        const ko = promptLo('ko', [{ ko: '가구', synonyms: '家具' }]);
        expect(ko[0].content).toMatch(/Revised Romanization/);
        expect(ko[1].content).toBe('0\t가구\t家具');
    });
    test('đọc kết quả: bỏ chỉ số sai, nghĩa rỗng, loại từ lạ; chịu được rào ```json', () => {
        const m = docKetQuaLo('```json\n[{"i":0,"vn":"Học Tập","type":"noun"},{"i":5,"vn":"x"},{"i":1,"vn":"","type":"verb"},{"i":2,"vn":"đồ đạc","type":"lạ"}]\n```', 3);
        expect(m.get(0)).toEqual({ vn: 'học tập', type: 'noun', phonetic: '' });
        expect(m.has(1)).toBe(false);
        expect(m.has(5)).toBe(false);
        expect(m.get(2).type).toBe('');
        expect(docKetQuaLo('không phải JSON', 3).size).toBe(0);
    });
});
