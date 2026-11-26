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
