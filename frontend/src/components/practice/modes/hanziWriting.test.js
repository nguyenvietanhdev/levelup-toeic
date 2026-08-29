/**
 * Tách từ ghép thành chữ Hán đơn — bước đầu tiên của chế độ luyện viết.
 *
 * Vì sao đáng test riêng: luyện viết `你好` không có nghĩa, phải luyện `你` rồi
 * `好`. Mà dữ liệu thật lẫn nhiều thứ không phải chữ Hán — dấu câu Trung
 * (，。！), chữ Latin trong ví dụ, khoảng trắng. Lọt một ký tự không phải Hán là
 * `fetch('/hanzi/，.json')` trả 404 và màn hình trắng.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { splitHanzi, HanziWriting } from './hanziWriting.js';
import { PartSelector } from '@components/vocab/part/partSelector.js';

describe('splitHanzi', () => {
    test('tách từ ghép thành từng chữ', () => {
        expect(splitHanzi('你好')).toEqual(['你', '好']);
        expect(splitHanzi('早上好')).toEqual(['早', '上', '好']);
    });

    test('chữ đơn giữ nguyên', () => {
        expect(splitHanzi('好')).toEqual(['好']);
    });

    test('LOẠI dấu câu Trung — nếu lọt sẽ tải file không tồn tại', () => {
        // Câu ví dụ trong DB có dạng "你好，我是越南人。"
        expect(splitHanzi('你好，我是越南人。')).toEqual(
            ['你', '好', '我', '是', '越', '南', '人']
        );
    });

    test('LOẠI chữ Latin, số và khoảng trắng', () => {
        expect(splitHanzi('好 good 123')).toEqual(['好']);
        expect(splitHanzi('HSK1 学')).toEqual(['学']);
    });

    test('đầu vào rỗng hoặc không hợp lệ trả mảng rỗng, không ném lỗi', () => {
        expect(splitHanzi('')).toEqual([]);
        expect(splitHanzi(null)).toEqual([]);
        expect(splitHanzi(undefined)).toEqual([]);
        expect(splitHanzi('abc')).toEqual([]);
    });

    test('giữ nguyên thứ tự xuất hiện', () => {
        // Thứ tự quan trọng: người học viết theo thứ tự chữ trong từ.
        expect(splitHanzi('中国人')).toEqual(['中', '国', '人']);
    });
});

/**
 * MỘT CÂU HỎI = MỘT TỪ, không phải một chữ.
 *
 * Bản đầu tôi tách mỗi chữ thành một câu riêng. Người học thấy pinyin "nǐ hǎo"
 * và nghĩa "Xin chào" nhưng chỉ được viết mỗi chữ `你` — mất luôn mối liên hệ
 * giữa mặt chữ và cái từ họ đang học, mà nhìn màn hình thì không thấy sai ở đâu.
 */
describe('generateQuestions — một câu là trọn một từ', () => {
    async function gen(words, config = {}) {
        vi.spyOn(PartSelector, 'getWordsForPractice').mockResolvedValue(words);
        const mode = Object.create(HanziWriting);
        mode.config = config;
        await mode.generateQuestions();
        return mode.questions;
    }

    test('từ nhiều chữ nằm TRỌN trong một câu, không bị xé lẻ', async () => {
        const qs = await gen([{ zh: '你好', phonetic: 'nǐ hǎo', vn: 'Xin chào' }]);
        expect(qs).toHaveLength(1);           // một từ → một câu, không phải hai
        expect(qs[0].word).toBe('你好');
        expect(qs[0].chars).toEqual(['你', '好']);
    });

    test('giữ pinyin từ key `phonetic` — KHÔNG phải key `pinyin`', async () => {
        // Dữ liệu thật lưu pinyin trong `phonetic`; đọc nhầm key thì mọi câu hiện
        // pinyin rỗng mà không có lỗi nào.
        const qs = await gen([{ zh: '学', phonetic: 'xué', vn: 'học' }]);
        expect(qs[0].pinyin).toBe('xué');
        expect(qs[0].meaning).toBe('học');
    });

    test('bỏ từ không có chữ Hán nào thay vì tạo câu rỗng', async () => {
        const qs = await gen([
            { zh: 'hello', phonetic: '', vn: 'xin chào' },
            { zh: '好', phonetic: 'hǎo', vn: 'tốt' },
        ]);
        expect(qs.map(q => q.word)).toEqual(['好']);
    });

    test('cắt đúng số câu mỗi lượt', async () => {
        const words = ['一', '二', '三', '四', '五'].map(z => ({ zh: z, phonetic: '', vn: '' }));
        const qs = await gen(words, { questionsPerRound: 3 });
        expect(qs).toHaveLength(3);
    });

    test('nguồn từ hỏng trả mảng rỗng, không ném lỗi', async () => {
        expect(await gen(null)).toEqual([]);
    });

    /**
     * Kho SONG NGỮ (Trung–Anh) phải viết chữ Hán được như kho `zh`.
     *
     * Bản ghi song ngữ KHÔNG có key `zh` sau khi qua mapper — chữ Hán nằm ở
     * `matZh.tu`, còn `en` đổi theo `hienThi` của từng bản ghi. Đọc mỗi
     * `w.zh || w.word` thì mọi từ đều bị `chars.length === 0` bỏ qua và lượt
     * luyện kết thúc ngay lúc bắt đầu — IM LẶNG, không lỗi nào báo.
     */
    describe('kho song ngữ Trung–Anh', () => {
        /** Bản ghi như mapper backend trả về (hienThi mặc định 'zh'). */
        const banGhiBi = {
            en: '你好',                       // mặt đang học
            vn: 'hello',                     // mặt kia — kho này không có tiếng Việt
            phonetic: 'nǐ hǎo',
            songNgu: true,
            matZh: { tu: '你好', phonetic: 'nǐ hǎo' },
            matEn: { tu: 'hello', phonetic: '/həˈloʊ/' },
        };

        test('sinh được câu hỏi từ `matZh.tu`', async () => {
            const qs = await gen([banGhiBi]);
            expect(qs).toHaveLength(1);
            expect(qs[0].word).toBe('你好');
            expect(qs[0].chars).toEqual(['你', '好']);
        });

        test('chiều ĐẢO (`hienThi: "en"`) vẫn ra chữ Hán', async () => {
            // Đây là ca `w.en` KHÔNG phải chữ Hán — `matZh` mới cứu được.
            const qs = await gen([{
                ...banGhiBi,
                en: 'hello',              // mặt đang học là tiếng Anh
                vn: '你好',
            }]);
            expect(qs).toHaveLength(1);
            expect(qs[0].word).toBe('你好');
        });

        test('pinyin lấy theo MẶT CHỮ HÁN, không theo chiều học', async () => {
            // Đang viết 你好 mà hiện /həˈloʊ/ là chỉ dẫn sai hẳn.
            const qs = await gen([{ ...banGhiBi, en: 'hello', phonetic: '/həˈloʊ/' }]);
            expect(qs[0].pinyin).toBe('nǐ hǎo');
        });

        test('nghĩa lấy mặt tiếng Anh — kho này không có tiếng Việt', async () => {
            const qs = await gen([banGhiBi]);
            expect(qs[0].meaning).toBe('hello');
        });

        test('chiều ĐẢO: nghĩa vẫn là tiếng Anh, KHÔNG phải chữ Hán', async () => {
            // Ca duy nhất phân biệt được `matEn.tu` với `vn`.
            //
            // Mapper đặt MẶT KIA vào ô `vn`, nên khi `hienThi: 'en'` thì
            // `vn` chính là chữ Hán. Đọc `vn` là hiện 你好 làm "nghĩa" của
            // 你好 — vô dụng, mà nhìn màn hình không thấy sai ở đâu.
            const qs = await gen([{ ...banGhiBi, en: 'hello', vn: '你好' }]);
            expect(qs[0].word).toBe('你好');
            expect(qs[0].meaning).toBe('hello');
        });

        test('kho `zh` cũ KHÔNG bị ảnh hưởng', async () => {
            const qs = await gen([{ zh: '谢谢', phonetic: 'xièxie', vn: 'Cảm ơn' }]);
            expect(qs[0].word).toBe('谢谢');
            expect(qs[0].pinyin).toBe('xièxie');
            expect(qs[0].meaning).toBe('Cảm ơn');
        });
    });
});

/**
 * "Xem mẫu" phải MỞ LẠI quiz sau khi diễn xong.
 *
 * Lỗi đã gặp: `animateCharacter()` huỷ quiz đang chạy (hành vi của thư viện).
 * Bấm Xem mẫu xong là không tô tiếp được — chữ vẫn hiện, chuột vẫn di, nhưng
 * không nét nào ăn và không có lỗi nào trong console. Bài luyện chết đứng mà
 * nhìn màn hình thì mọi thứ trông bình thường.
 */
describe('showDemo — diễn xong phải mở lại quiz', () => {
    function stub({ autoComplete = true } = {}) {
        const mode = Object.create(HanziWriting);
        mode.questions = [{ word: '品牌', chars: ['品', '牌'], pinyin: 'pǐnpái', meaning: 'Thương hiệu' }];
        mode.currentIndex = 0;
        mode.charIndex = 1;
        mode.strokeNum = 4;
        mode._demoing = false;
        mode.quizCalls = [];
        mode.writer = {
            quiz: (opts) => mode.quizCalls.push(opts),
            animateCharacter: (opts) => { if (autoComplete) opts?.onComplete?.(); },
        };
        return mode;
    }

    test('mở lại quiz sau khi diễn xong', () => {
        const mode = stub();
        mode.showDemo();
        expect(mode.quizCalls).toHaveLength(1);
    });

    test('mở lại ĐÚNG nét đang dở, không bắt tô lại từ đầu', () => {
        const mode = stub();
        mode.showDemo();
        expect(mode.quizCalls[0].quizStartStrokeNum).toBe(4);
    });

    test('bấm dồn khi đang diễn không xếp chồng quiz', () => {
        // animateCharacter chưa gọi onComplete → vẫn đang diễn.
        const mode = stub({ autoComplete: false });
        mode.showDemo();
        mode.showDemo();
        mode.showDemo();
        expect(mode.quizCalls).toHaveLength(0);   // chưa diễn xong thì chưa mở lại
        expect(mode._demoing).toBe(true);
    });

    test('chưa có writer thì bỏ qua, không ném lỗi', () => {
        const mode = stub();
        mode.writer = null;
        expect(() => mode.showDemo()).not.toThrow();
    });
});

/**
 * Từ dài: hàng ô cuộn ngang, nên ô đang viết phải TỰ cuộn vào tầm nhìn.
 *
 * Không có bước này thì viết xong chữ thứ 4 là màn hình đứng im — ô kế tiếp đã
 * sẵn sàng và đang nhận chuột, nhưng nằm ngoài vùng nhìn nên người học không
 * biết phải viết ở đâu. Lại đúng hình dạng "hỏng mà trông như bình thường".
 */
describe('mountWriter — cuộn ô đang viết vào tầm nhìn', () => {
    // mountWriter tạo HanziWriter thật, mà nó gọi charDataLoader → fetch() với
    // đường dẫn tương đối. jsdom không có base URL nên fetch ném ERR_INVALID_URL
    // ngoài promise: test vẫn xanh nhưng vitest báo "Unhandled Errors". Chặn ở
    // đây để test chỉ nói về việc cuộn, không kéo theo tiếng ồn của mạng.
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    });
    afterEach(() => { vi.unstubAllGlobals(); });

    test('gọi scrollIntoView trên ĐÚNG ô đang viết', async () => {
        const { HanziWriting } = await import('./hanziWriting.js');
        const q = { word: '这是谁', chars: ['这', '是', '谁'], pinyin: '', meaning: '' };

        document.body.innerHTML = q.chars
            .map((_, i) => `<div class="hanzi-canvas" id="hanzi-box-${i}"></div>`).join('');

        const calls = [];
        q.chars.forEach((_, i) => {
            document.getElementById(`hanzi-box-${i}`).scrollIntoView = () => calls.push(i);
        });

        const mode = Object.create(HanziWriting);
        mode._writers = [];
        mode.charIndex = 2;                 // đang viết chữ thứ 3
        mode.questions = [q];
        mode.currentIndex = 0;
        mode.openQuiz = () => {};           // không dựng quiz thật trong test
        mode.mountWriter(q);

        expect(calls).toEqual([2]);         // cuộn tới ô 2, không phải ô nào khác
    });

    test('trình duyệt cũ không có scrollIntoView thì bỏ qua, không ném lỗi', async () => {
        const { HanziWriting } = await import('./hanziWriting.js');
        const q = { word: '你好', chars: ['你', '好'], pinyin: '', meaning: '' };
        document.body.innerHTML = '<div class="hanzi-canvas" id="hanzi-box-0"></div>';
        document.getElementById('hanzi-box-0').scrollIntoView = undefined;

        const mode = Object.create(HanziWriting);
        mode._writers = [];
        mode.charIndex = 0;
        mode.questions = [q];
        mode.currentIndex = 0;
        mode.openQuiz = () => {};
        expect(() => mode.mountWriter(q)).not.toThrow();
    });
});

/**
 * `hanzi-writer` nạp THEO YÊU CẦU.
 *
 * Import tĩnh kéo cả thư viện (~35 kB, 11 kB gzip) vào chunk khởi động, nên MỌI
 * người dùng tải nó — kể cả người chỉ học tiếng Anh, mà chế độ này còn bị chặn
 * hẳn khi ngôn ngữ từ vựng không phải tiếng Trung.
 *
 * Chỗ dễ hỏng: `mountWriter` là hàm ĐỒNG BỘ và được gọi lại cho từng chữ. Nạp
 * xong ở `start()` thì đường chạy bình thường luôn có thư viện, nhưng hàm vẫn
 * phải tự bảo vệ — thiếu thì `HanziWriter.create` ném "Cannot read properties
 * of null" và cả lượt luyện chết giữa chừng.
 */
describe('nạp thư viện theo yêu cầu', () => {
    const src = readFileSync(join(__dirname, 'hanziWriting.js'), 'utf8');

    test('KHÔNG import tĩnh hanzi-writer', () => {
        expect(src).not.toMatch(/^import HanziWriter from 'hanzi-writer'/m);
    });

    test('dùng dynamic import, giữ lại để tải một lần', () => {
        expect(src).toMatch(/await import\('hanzi-writer'\)/);
        expect(src).toMatch(/if \(!HanziWriter\)/);
    });

    test('start() nạp TRƯỚC khi dựng câu hỏi', () => {
        const i = src.indexOf('await ensureHanziWriter()');
        const j = src.indexOf('await this.generateQuestions()');
        expect(i).toBeGreaterThan(-1);
        expect(i).toBeLessThan(j);
    });

    test('nạp hỏng thì báo rõ, không để màn hình trống', () => {
        const i = src.indexOf('await ensureHanziWriter()');
        const block = src.slice(i, i + 600);
        expect(block).toMatch(/catch/);
        expect(block).toMatch(/Không tải được bộ vẽ chữ/);
    });

    test('mountWriter tự bảo vệ khi thư viện chưa sẵn sàng', () => {
        // Nó còn được gọi trực tiếp lúc chuyển sang chữ kế tiếp.
        expect(src).toMatch(/HanziWriter\?\.create\(/);
    });

    test('không đẩy writer rỗng vào danh sách huỷ', () => {
        expect(src).toMatch(/if \(this\.writer\) this\._writers\.push/);
    });
});
