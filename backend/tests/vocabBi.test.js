/**
 * Kho từ SONG NGỮ.
 *
 * Hai chỗ dễ hỏng nhất, và cả hai đều hỏng IM LẶNG:
 *
 *   1. Đổi hình sai mặt → loa đọc 你好 bằng giọng Anh, nghe không ra chữ nào.
 *   2. Từ song ngữ lẫn vào danh sách ôn từ sai của hai kho cũ, vì
 *      `WrongWord.langFilter` phân loại bản ghi cũ bằng regex chữ Hán.
 */
const { doiHinh, doiHinhNhieu } = require('../services/vocabBiMapper');
const WrongWord = require('../models/WrongWord');

const MAU = {
    _id: 'x1',
    zh: '你好', en: 'hello',
    hienThi: 'zh',
    phoneticZh: 'nǐ hǎo', phoneticEn: '/həˈloʊ/',
    exampleZh: '你好，很高兴认识你。', exampleEn: 'Hello, nice to meet you.',
    examplePhoneticZh: 'nǐ hǎo, hěn gāoxìng rènshi nǐ.',
    examplePhoneticEn: '/həˈloʊ naɪs tə miːt juː/',
    part: 'Chào hỏi', source: 'song_ngu',
};

describe('đổi hình về dạng 16 chế độ đã hiểu', () => {
    test('`en` mang TỪ PHẢI NHỚ, không phải chữ tiếng Anh', () => {
        // `word.en` là khoá chính xuyên hệ thống (`wordPk`, `WrongWord.en`,
        // `modeStats`). Đặt chữ tiếng Anh vào đó thì khi học mặt Hán, từ sai
        // lưu lại là "hello" — mở ra ôn thấy từ khác hẳn thứ vừa học.
        expect(doiHinh(MAU).en).toBe('你好');
    });

    test('MẶT KIA nằm ở ô `vn` — ô mà 13/16 chế độ đọc làm đáp án', () => {
        // Kho này không có nghĩa tiếng Việt: học Trung ↔ Anh thì `en` chính là
        // đáp án. Đặt nó vào `vn` để không chế độ nào phải sửa một dòng.
        expect(doiHinh(MAU).vn).toBe('hello');
    });

    test('đảo mặt thì đáp án cũng đảo', () => {
        expect(doiHinh({ ...MAU, hienThi: 'en' }).vn).toBe('你好');
    });

    test('phiên âm của đáp án đi kèm', () => {
        expect(doiHinh(MAU).vnPhonetic).toBe('/həˈloʊ/');
        expect(doiHinh({ ...MAU, hienThi: 'en' }).vnPhonetic).toBe('nǐ hǎo');
    });

    test('phiên âm đi theo ĐÚNG mặt đang hiện', () => {
        // Hiện pinyin cạnh từ tiếng Anh (hoặc ngược lại) là vô nghĩa.
        expect(doiHinh(MAU).phonetic).toBe('nǐ hǎo');
        expect(doiHinh({ ...MAU, hienThi: 'en' }).phonetic).toBe('/həˈloʊ/');
    });

    test('câu ví dụ cùng mặt với từ', () => {
        // Khác mặt thì loa đọc câu bằng giọng sai.
        expect(doiHinh(MAU).example).toBe('你好，很高兴认识你。');
        expect(doiHinh({ ...MAU, hienThi: 'en' }).example).toBe('Hello, nice to meet you.');
    });

    test('câu ví dụ mặt kia đóng vai "bản dịch"', () => {
        expect(doiHinh(MAU).exampleVn).toBe('Hello, nice to meet you.');
        expect(doiHinh({ ...MAU, hienThi: 'en' }).exampleVn).toBe('你好，很高兴认识你。');
    });

    test('phiên âm câu ví dụ cũng đi theo mặt', () => {
        expect(doiHinh(MAU).examplePhonetic).toBe('nǐ hǎo, hěn gāoxìng rènshi nǐ.');
        expect(doiHinh({ ...MAU, hienThi: 'en' }).examplePhonetic)
            .toBe('/həˈloʊ naɪs tə miːt juː/');
    });

    test('nói rõ GIỌNG ĐỌC, không để client đoán', () => {
        // `ttsLang()` ở client là nhị phân zh/en dựa trên `vocabLang`, mà kho
        // song ngữ không có giá trị `vocabLang` riêng — không nói rõ thì nó
        // đọc 你好 bằng giọng Anh.
        expect(doiHinh(MAU).ttsLang).toBe('zh-CN');
        expect(doiHinh({ ...MAU, hienThi: 'en' }).ttsLang).toBe('en-US');
    });

    test('mặt `en`: `en` mang chữ tiếng Anh, `vn` mang chữ Hán', () => {
        const d = doiHinh({ ...MAU, hienThi: 'en' });
        expect(d.en).toBe('hello');
        expect(d.vn).toBe('你好');
    });

    test('thiếu `hienThi` thì mặc định mặt Hán', () => {
        const { hienThi, ...khongCo } = MAU;
        expect(doiHinh(khongCo).en).toBe('你好');
    });

    test('có cờ `songNgu` để client khỏi phải đoán', () => {
        expect(doiHinh(MAU).songNgu).toBe(true);
    });

    test('nhận cả document Mongoose lẫn object thuần', () => {
        const gia = { ...MAU, toObject: () => MAU };
        expect(doiHinh(gia).en).toBe('你好');
    });

    test('`null` không làm vỡ', () => {
        expect(doiHinh(null)).toBeNull();
        expect(doiHinhNhieu(null)).toEqual([]);
        expect(doiHinhNhieu([MAU, null]).length).toBe(1);
    });
});

describe('từ song ngữ KHÔNG lẫn vào hai kho cũ', () => {
    test('lọc `bi` khớp chính xác, không đoán bằng chữ Hán', () => {
        expect(WrongWord.langFilter('bi')).toEqual({ lang: 'bi' });
    });

    test('lọc `zh` loại hẳn `bi` ra', () => {
        // Không loại thì từ song ngữ mặt Hán lọt vào danh sách ôn tiếng Trung —
        // mở ra thấy từ của bộ khác hẳn.
        const f = JSON.stringify(WrongWord.langFilter('zh'));
        expect(f).toContain('"$ne":"bi"');
    });

    test('lọc `en` cũng loại `bi` ra', () => {
        // Mặt Latin của từ song ngữ trông y hệt từ tiếng Anh.
        const f = JSON.stringify(WrongWord.langFilter('en'));
        expect(f).toContain('"$ne":"bi"');
    });

    test('vẫn đoán được bản ghi CŨ thiếu `lang`', () => {
        // Dữ liệu có trước khi trường `lang` tồn tại vẫn phải phân loại đúng —
        // thêm `bi` không được phá thứ đang chạy.
        const f = JSON.stringify(WrongWord.langFilter('zh'));
        expect(f).toContain('$exists');
        expect(f).toContain('$regex');
    });

    test('enum nhận `bi`', () => {
        // Mongoose `strict` chặn giá trị ngoài enum — quên mở rộng thì mọi từ
        // sai của kho song ngữ bị từ chối lúc lưu.
        const enums = WrongWord.schema.path('lang').enumValues;
        expect(enums).toContain('bi');
        expect(enums).toContain('en');
        expect(enums).toContain('zh');
    });
});

describe('schema kho song ngữ', () => {
    const VocabularyBi = require('../models/VocabularyBi');

    test('hai ngôn ngữ BẮT BUỘC, KHÔNG lưu `vn`', () => {
        // Học Trung ↔ Anh thì `en` chính là đáp án — lưu thêm nghĩa tiếng Việt
        // là một key không ai đọc tới.
        for (const f of ['zh', 'en']) {
            expect(VocabularyBi.schema.path(f).isRequired).toBe(true);
        }
        expect(VocabularyBi.schema.path('vn')).toBeUndefined();
        expect(VocabularyBi.schema.path('exampleVn')).toBeUndefined();
    });

    test('phiên âm TÁCH ĐÔI theo ngôn ngữ', () => {
        // Một bản ghi có hai từ cần đọc — dùng chung một ô `phonetic` thì hiện
        // pinyin cạnh từ tiếng Anh.
        expect(VocabularyBi.schema.path('phoneticZh')).toBeDefined();
        expect(VocabularyBi.schema.path('phoneticEn')).toBeDefined();
        expect(VocabularyBi.schema.path('phonetic')).toBeUndefined();
    });

    test('nằm ở collection RIÊNG, không đụng hai kho cũ', () => {
        expect(VocabularyBi.collection.name).toBe('vocabularies_bi');
    });

    test('chống nạp trùng theo (source + zh)', () => {
        // Unique theo `zh` trần là chặn nhầm: cùng một chữ Hán có thể ở hai bộ
        // khác nhau với nghĩa khác nhau.
        const idx = VocabularyBi.schema.indexes();
        const u = idx.find(([, o]) => o && o.unique);
        expect(u).toBeDefined();
        expect(u[0]).toEqual({ source: 1, zh: 1 });
    });

    test('KHÔNG khai index thừa cho upload cá nhân', () => {
        // Kho này nạp tay, toàn bộ public — không có owner, scope, TTL.
        // `vocabularies_en` khai 9 index và trả giá bằng 5,8 MB index trên
        // 1,8 MB data. M0 chật RAM hơn chật đĩa.
        const khoa = VocabularyBi.schema.indexes().flatMap(([k]) => Object.keys(k));
        for (const thua of ['ownerId', 'ownerEmail', 'uploadBatchId', 'expiresAt', 'scope']) {
            expect(khoa).not.toContain(thua);
        }
    });
});

describe('admin: tab thứ ba `lang=bi`', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const ctrl = readFileSync(
        join(__dirname, '..', 'controllers', 'vocabularyController.js'), 'utf8');
    const html = readFileSync(
        join(__dirname, '..', 'public', 'admin', 'partials', 'tabs', 'vocabulary.html'), 'utf8');
    const vocabJs = readFileSync(
        join(__dirname, '..', 'public', 'admin', 'js', 'features', 'vocab', 'vocab.js'), 'utf8');
    const coreJs = readFileSync(
        join(__dirname, '..', 'public', 'admin', 'js', 'core', 'core.js'), 'utf8');

    /** Thân một hàm, cắt tới dấu `}` ở đầu dòng. */
    function than(nguon, ten) {
        const i = nguon.indexOf(ten);
        expect(i).toBeGreaterThan(-1);
        return nguon.slice(i, nguon.indexOf('\n}', i));
    }

    test('`lang=bi` chọn đúng kho song ngữ', () => {
        const t = than(ctrl, 'function getVocabModel');
        expect(t).toMatch(/lang === 'bi'/);
        expect(t).toMatch(/return VocabularyBi/);
    });

    test('giá trị lạ vẫn rơi về tiếng Anh, không vỡ', () => {
        // Client cũ không gửi `lang` bao giờ.
        const t = than(ctrl, 'function getVocabModel');
        expect(t).toMatch(/return Vocabulary;/);
    });

    test('khoá chính của kho song ngữ là `zh`', () => {
        // Lấy `en` làm khoá thì hai chữ Hán khác nhau dịch ra cùng một từ tiếng
        // Anh sẽ chặn nhầm nhau khi nhập.
        const t = than(ctrl, 'function pkField');
        expect(t).toMatch(/isBiRequest\(req\)\) return 'zh'/);
    });

    test('KHÔNG viết hoa `part` cho kho song ngữ', () => {
        // Chỉ kho tiếng Anh dùng PART viết hoa. Viết hoa "Chào hỏi" là lọc ra
        // 0 từ.
        const t = than(ctrl, 'function normalizePartForLang');
        expect(t).toMatch(/isBiRequest\(req\)/);
    });

    test('`raw=1` trả NGUYÊN bản ghi cho màn hình quản trị', () => {
        // `vocabBiMapper` giấu một mặt đi — dùng ở admin là làm mất dữ liệu
        // ngay trên màn hình sửa. Mặc định thì đổi hình, vì bên gọi đông nhất
        // là app luyện tập.
        const t = than(ctrl, 'function normalizeVocabDocForResponse');
        expect(t).toMatch(/raw === '1'\) return word/);
    });

    test('tìm kiếm soi cả chữ Hán', () => {
        // Gõ 你好 mà chỉ soi `en`/`vn` thì không ra gì, dù chữ đó nằm ngay
        // trên màn hình.
        const i = ctrl.indexOf('if (search) {');
        expect(ctrl.slice(i, i + 400)).toMatch(/isBiRequest\(req\)[\s\S]*?\{ zh: re \}/);
    });

    test('kiểm nhập: kho song ngữ cần đủ zh + en + vn', () => {
        const t = than(ctrl, 'function validateVocabularyPayloadForLang');
        expect(t).toMatch(/isBiRequest/);
        expect(t).toMatch(/'zh', 'en'/);
    });

    test('có nút tab thứ ba trong HTML', () => {
        expect(html).toMatch(/data-vocab-lang="bi"/);
    });

    test('bảng có cột phụ cho mặt còn lại', () => {
        expect(html).toMatch(/id="vocab-col-alt"/);
        // Ẩn mặc định: hai kho cũ chỉ có một từ mỗi bản ghi.
        const i = html.indexOf('id="vocab-col-alt"');
        expect(html.slice(i, i + 120)).toMatch(/display:none/);
    });

    test('đổi tiêu đề cột khi sang tab song ngữ', () => {
        // Để nguyên "Tiếng Anh" thì admin nhìn chữ Hán dưới tiêu đề sai.
        const t = than(coreJs, 'function capNhatCotTuVung');
        expect(t).toMatch(/lang === "bi"/);
        expect(t).toMatch(/Tiếng Trung/);
    });

    test('gọi đổi tiêu đề ngay khi bấm tab', () => {
        const i = coreJs.indexOf('vocabCurrentLang = btn.dataset.vocabLang');
        expect(coreJs.slice(i, i + 200)).toMatch(/capNhatCotTuVung/);
    });

    test('cột chính hiện chữ HÁN, không phải chữ tiếng Anh', () => {
        // `word.en || word.zh` chọn nhầm vì bản ghi song ngữ có CẢ HAI.
        //
        // Soi ĐÚNG nhánh song ngữ, không phải cả đoạn: kiểm "có chữ zh ở đâu
        // đó gần đây" thì đổi nhánh thành `word.en` vẫn xanh, vì nhánh kia
        // (`word.en || word.zh`) cũng chứa `word.zh`.
        const i = vocabJs.indexOf('const primaryWord = laSongNgu');
        expect(i).toBeGreaterThan(-1);
        const nhanh = vocabJs.slice(i, vocabJs.indexOf(';', i));
        // Dạng: laSongNgu ? (word.zh || '') : (word.en || word.zh || '')
        const truocDauHai = nhanh.slice(0, nhanh.indexOf(':'));
        expect(truocDauHai).toMatch(/word\.zh/);
        expect(truocDauHai).not.toMatch(/word\.en/);
    });

    test('phiên âm hiện đúng theo ngôn ngữ của cột', () => {
        const i = vocabJs.indexOf('const phienAmChinh');
        expect(i).toBeGreaterThan(-1);
        expect(vocabJs.slice(i, i + 150)).toMatch(/phoneticZh/);
    });
});

describe('app luyện tập: lựa chọn ngôn ngữ thứ ba', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const F = (...p) => readFileSync(join(__dirname, '..', '..', 'frontend', 'src', ...p), 'utf8');
    const quick = F('layouts', 'QuickSettings.jsx');
    const api = F('api', 'vocabulary.js');
    const gl = F('game', 'gameLogic.js');
    const ctrl = readFileSync(
        join(__dirname, '..', 'controllers', 'vocabularyController.js'), 'utf8');

    test('dropdown có lựa chọn thứ ba', () => {
        expect(quick).toMatch(/<option value="bi">/);
    });

    test('đổi ngôn ngữ nhận ĐÍCH, không đảo hai chiều', () => {
        // `en ↔ zh` cứng thì chọn `bi` sẽ nhảy sang `zh` — chọn một đằng ra
        // một nẻo, mà không báo lỗi gì.
        expect(quick).toMatch(/handleToggleVocabLang\(next\)/);
        expect(quick).toMatch(/const next = dich \|\|/);
    });

    test('kho song ngữ chịu chung mốc Level với tiếng Trung', () => {
        // Nó cũng có chữ Hán — mở ra khi chưa mở tiếng Trung là đi cửa sau.
        expect(quick).toMatch(/next === 'zh' \|\| next === 'bi'/);
    });

    test('nhãn chiều luyện tập KHÔNG nói "Tiếng Việt" cho kho song ngữ', () => {
        // Kho này học Trung ↔ Anh, không đi qua tiếng Việt.
        const i = quick.indexOf('const tenChieu');
        expect(i).toBeGreaterThan(-1);
        const t = quick.slice(i, i + 300);
        expect(t).toMatch(/vocabLang === 'bi'/);
        expect(t).toMatch(/sang: 'Tiếng Anh'/);
    });

    test('`getVocabLang` cho `bi` đi qua', () => {
        // Thiếu nó thì lựa chọn thứ ba âm thầm rơi về tiếng Anh.
        const i = api.indexOf('const stored = localStorage.getItem');
        expect(api.slice(i, i + 300)).toMatch(/stored === 'bi'/);
    });

    test('`ttsLang` quyết theo TỪNG TỪ, không theo cả kho', () => {
        // Bộ song ngữ có cả chữ Hán lẫn chữ Latin — quyết theo kho là đọc sai
        // một nửa số từ.
        const i = gl.indexOf('export function ttsLang');
        const t = gl.slice(i, gl.indexOf('\n}', i));
        expect(t).toMatch(/word\?\.ttsLang/);
    });

    test('vẫn rơi về luật cũ khi không có `word`', () => {
        const i = gl.indexOf('export function ttsLang');
        const t = gl.slice(i, gl.indexOf('\n}', i));
        expect(t).toMatch(/vocabLang\(\) === 'zh' \? 'zh-CN' : 'en-US'/);
    });

    test('API đổi hình cho app, trả nguyên bản cho admin', () => {
        const i = ctrl.indexOf('function normalizeVocabDocForResponse');
        const t = ctrl.slice(i, ctrl.indexOf('\n}', i));
        expect(t).toMatch(/raw === '1'\) return word/);
        expect(t).toMatch(/return doiHinh\(word\)/);
    });

    test('admin gửi `raw=1` để giữ nguyên bản ghi', () => {
        const adm = readFileSync(join(
            __dirname, '..', 'public', 'admin', 'js', 'features', 'vocab', 'vocab.js'), 'utf8');
        expect(adm).toMatch(/raw=1/);
    });
});

describe('bộ đề: chọn đúng bảng cho kho song ngữ', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const Topic = require('../models/Topic');
    const topicCtrl = readFileSync(
        join(__dirname, '..', 'controllers', 'topicController.js'), 'utf8');
    const html = readFileSync(
        join(__dirname, '..', 'public', 'admin', 'partials', 'tabs', 'topics.html'), 'utf8');
    const tabs = readFileSync(
        join(__dirname, '..', 'public', 'admin', 'js', 'core', 'tabs.js'), 'utf8');

    test('`Topic.lang` nhận `bi`', () => {
        // Thiếu ở enum thì Mongoose từ chối lúc lưu và đề không tạo được.
        expect(Topic.schema.path('lang').enumValues).toContain('bi');
    });

    test('đếm từ tra ĐÚNG bảng', () => {
        // Đếm nhầm bảng thì đề song ngữ báo "0 từ" dù có dữ liệu, và người
        // dùng tưởng bộ đề hỏng.
        const i = topicCtrl.indexOf('function getVocabularyModelByLang');
        const t = topicCtrl.slice(i, topicCtrl.indexOf('\n}', i));
        expect(t).toMatch(/lang === "bi"/);
        expect(t).toMatch(/VocabularyBi/);
    });

    test('bộ lọc ngôn ngữ có lựa chọn thứ ba', () => {
        expect(html).toMatch(/<option value="bi">/);
    });

    test('form thêm/sửa đề chọn được song ngữ', () => {
        expect(tabs).toMatch(/value="bi".*ti-lang|topic\?\.lang === "bi"/);
    });

    test('nhãn ngôn ngữ tra BẢNG, không phải `zh ? :`', () => {
        // Nhị phân thì đề song ngữ hiện "🇬🇧 EN" — sai mà không báo lỗi gì.
        expect(tabs).toMatch(/NHAN_NGON_NGU/);
        const i = tabs.indexOf('const NHAN_NGON_NGU');
        expect(tabs.slice(i, i + 250)).toMatch(/bi:/);
    });

    test('bảng nhãn khai TRƯỚC chỗ dùng', () => {
        // Dùng trước khi khai với `const` là ReferenceError lúc chạy, mà build
        // KHÔNG bắt được.
        expect(tabs.indexOf('const NHAN_NGON_NGU'))
            .toBeLessThan(tabs.indexOf('NHAN_NGON_NGU[t.lang'));
    });
});

describe('nhận thưởng hàng loạt', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const ctrl = readFileSync(
        join(__dirname, '..', 'controllers', 'userStateController.js'), 'utf8');
    const routes = readFileSync(
        join(__dirname, '..', 'routes', 'userState.js'), 'utf8');

    const than = () => {
        const i = ctrl.indexOf('exports.claimAllAchievements');
        expect(i).toBeGreaterThan(-1);
        return ctrl.slice(i, ctrl.indexOf('\n};', i));
    };

    test('có route riêng', () => {
        expect(routes).toMatch(/achievements\/claim-all/);
        expect(routes).toMatch(/claimAllAchievements/);
    });

    test('tải dữ liệu dùng chung MỘT LẦN, không lặp trong vòng', () => {
        // Cả điểm mấu chốt của endpoint này: 30 request tuần tự mất 8,2 giây.
        const t = than();
        const iVong = t.indexOf('for (const def of dks)');
        expect(iVong).toBeGreaterThan(-1);
        // Không truy vấn stats/profile bên trong vòng duyệt điều kiện.
        const vong = t.slice(iVong, t.indexOf('}', t.indexOf('else truot.push')));
        expect(vong).not.toMatch(/await UserStats\.findOne|await UserProfile\.findOne/);
    });

    test('VẪN kiểm điều kiện từng cái', () => {
        // Gộp request không phải cớ để bỏ kiểm — bỏ là thành cửa sau phát
        // thưởng miễn phí.
        //
        // Phải soi KẾT QUẢ được dùng, không chỉ "có gọi hàm": gọi rồi vứt đi
        // (`dat.push(def)` vô điều kiện) thì test chỉ khớp tên hàm vẫn xanh.
        const t = than();
        expect(t).toMatch(/const check = checkAchievementCondition\(def, stats, profile\)/);
        expect(t).toMatch(/if \(check\.ok\) dat\.push\(def\)/);
        expect(t).toMatch(/else truot\.push/);
    });

    test('bỏ qua thành tích ĐÃ nhận', () => {
        expect(than()).toMatch(/daMo\.has\(def\.code\)\) continue/);
    });

    test('`insertMany` không đổ cả mẻ khi một cái trùng', () => {
        // Bấm hai lần hoặc mở hai tab thì trùng là bình thường.
        //
        // Soi ĐỐI SỐ thật của `insertMany`, không phải chuỗi "ordered: false"
        // ở đâu đó trong hàm — comment giải thích cũng chứa chuỗi đó.
        const t = than();
        const i = t.indexOf('UserAchievement.insertMany(');
        expect(i).toBeGreaterThan(-1);
        const loiGoi = t.slice(i, t.indexOf('catch', i));
        expect(loiGoi).toMatch(/\{ ordered: false \}/);
        expect(t).toMatch(/11000/);
    });

    test('lưu `stats` MỘT lần ở cuối, không lưu trong vòng', () => {
        const t = than();
        const iVongThuong = t.indexOf('for (const def of dat)');
        const vong = t.slice(iVongThuong, t.indexOf('// Vật phẩm'));
        expect(vong).not.toMatch(/stats\.save\(\)/);
        expect(t).toMatch(/stats\.save\(\)/);
    });

    test('trả về danh sách ĐÃ nhận để client đánh dấu đúng', () => {
        expect(than()).toMatch(/claimed: dat\.map/);
    });

    test('không có gì đủ điều kiện thì trả rỗng, không vỡ', () => {
        expect(than()).toMatch(/if \(!dat\.length\)/);
    });
});

describe('prompt AI biết kho song ngữ', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const users = readFileSync(join(
        __dirname, '..', 'public', 'admin', 'js', 'features', 'users', 'users.js'), 'utf8');
    const monitor = readFileSync(join(
        __dirname, '..', 'public', 'admin', 'js', 'features', 'monitor', 'monitor.js'), 'utf8');
    const upload = readFileSync(join(
        __dirname, '..', '..', 'frontend', 'src', 'components', 'vocab', 'upload',
        'openUploadModal.js'), 'utf8');

    test('admin: có nhánh prompt riêng cho `bi`', () => {
        expect(users).toMatch(/if \(lang === "bi"\)/);
    });

    test('admin: prompt CẤM key `vn`', () => {
        // Kho song ngữ không khai `vn`; AI tự thêm thì Mongoose vứt im lặng và
        // người nhập không biết mình mất dữ liệu.
        const i = users.indexOf('if (lang === "bi")');
        const t = users.slice(i, users.indexOf('} else if (lang === "zh")', i));
        expect(t).toMatch(/không thêm key "vn"/);
        expect(t).toMatch(/phoneticZh/);
        expect(t).toMatch(/phoneticEn/);
    });

    test('admin: prompt dùng khung HSK, không phải CEFR', () => {
        const i = users.indexOf('if (lang === "bi")');
        const t = users.slice(i, users.indexOf('} else if (lang === "zh")', i));
        expect(t).toMatch(/HSK/);
    });

    test('admin: gợi ý key và ví dụ dán đúng kho', () => {
        expect(monitor).toMatch(/if \(lang === 'bi'\)/);
        const i = monitor.indexOf("if (lang === 'bi')");
        const t = monitor.slice(i, monitor.indexOf("} else if (lang === 'zh')", i));
        expect(t).toMatch(/zh, en, phoneticZh, phoneticEn/);
        // Không được liệt kê `vn` — kho này không có.
        expect(t).not.toMatch(/hint\.textContent = '[^']*\bvn\b/);
    });

    test('từ vựng riêng: kho song ngữ vẫn theo luật chữ Hán', () => {
        // pinyin, từ loại 名词, khung HSK — mặt chính là chữ Hán.
        expect(upload).toMatch(/const isZh = khoHienTai === 'zh' \|\| isBi/);
    });

    test('từ vựng riêng: `lang` là `bi`, không mượn `zh`', () => {
        // Gộp nhãn thì bộ từ riêng song ngữ lẫn vào danh sách kho tiếng Trung.
        expect(upload).toMatch(/langValue = isBi \? 'bi'/);
    });

    test('từ vựng riêng: prompt xin thêm nghĩa tiếng Anh', () => {
        expect(upload).toMatch(/enMeaning/);
    });
});

describe('từ vựng riêng lưu được 3 key', () => {
    const UserUpload = require('../models/UserUpload');
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const ctrl = readFileSync(
        join(__dirname, '..', 'controllers', 'uploadController.js'), 'utf8');

    test('`lang` nhận `bi`', () => {
        expect(UserUpload.schema.path('lang').enumValues).toContain('bi');
    });

    test('có trường `enMeaning`', () => {
        // Có nó thì MỘT bộ từ luyện được cả Trung→Việt lẫn Trung→Anh.
        expect(UserUpload.schema.path('enMeaning')).toBeDefined();
    });

    test('`bi` do client khai được TÔN TRỌNG trước suy đoán', () => {
        // Bộ song ngữ cũng toàn chữ Hán nên `hasHan` sẽ ép thành 'zh' và bộ đó
        // mất nhãn riêng — lẫn vào danh sách kho tiếng Trung.
        const i = ctrl.indexOf('const resolveLang');
        const than = ctrl.slice(ctrl.indexOf('{', i), ctrl.indexOf('\n};', i));
        expect(than).toMatch(/if \(lang === 'bi'\) return 'bi';/);

        // So thứ tự trên CODE, không tính comment: comment giải thích cũng
        // nhắc `hasHan` và nó đứng trước, nên so trên văn bản thô luôn sai.
        const code = than.replace(/\/\/[^\n]*/g, '');
        expect(code.indexOf("lang === 'bi'")).toBeLessThan(code.indexOf('hasHan'));
    });

    test('`enMeaning` đi qua được cả hai đường ghi', () => {
        // Mongoose `strict` vứt im lặng trường không liệt kê ở `$set`.
        expect(ctrl).toMatch(/enMeaning: lower\(enMeaning\)/);
        expect(ctrl).toMatch(/enMeaning: w\.enMeaning \|\| ''/);
    });

    test('`enMeaning` có trong destructure của body', () => {
        expect(ctrl).toMatch(/en, vn, enMeaning, phonetic/);
    });
});
