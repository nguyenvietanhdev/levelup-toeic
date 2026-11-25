/**
 * Sổ đăng ký ngôn ngữ — nguồn duy nhất về ngôn ngữ cho cả backend và frontend.
 *
 * Chỗ dễ hỏng: ngôn ngữ mới khai thiếu trường (TTS không có mã giọng, prompt không có tên);
 * văn bản tiếng Nhật có Kanji bị nhận là tiếng Trung; ngôn ngữ chưa mở lọt vào dùng thật;
 * sổ đặt ngoài backend/ làm ảnh Docker (chỉ chép backend/) sập khi khởi động.
 */
const fs = require('fs');
const path = require('path');
const N = require('../config/ngonNgu');

const BAT_BUOC = ['ma', 'tenViet', 'tenNgan', 'tenPrompt', 'bcp47', 'giongEdge', 'chuViet', 'donViDem', 'tachTu', 'khungCapDo'];

describe('dữ liệu sổ', () => {
    test('mã không trùng; mọi mục đủ trường; ngôn ngữ đang mở có kho từ vựng', () => {
        expect(new Set(N.MA_NGON_NGU).size).toBe(N.MA_NGON_NGU.length);
        for (const n of N.SO.ngonNgu) {
            for (const k of BAT_BUOC) expect([n.ma, k, n[k]]).toEqual([n.ma, k, expect.anything()]);
            expect(['tu', 'chu']).toContain(n.donViDem);
            expect(n.bcp47).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
            expect(n.giongEdge.startsWith(n.bcp47)).toBe(true);
            if (n.hoatDong) expect(n.kho && n.truongDauMuc).toBeTruthy();
        }
    });

    test('đang mở: Anh, Trung; Nhật, Hàn khai sẵn nhưng chưa mở', () => {
        expect(N.NGON_NGU_HOAT_DONG).toEqual(['en', 'zh']);
        expect(N.MA_NGON_NGU).toEqual(expect.arrayContaining(['ja', 'ko']));
    });

    test('sổ nằm trong backend/ (ảnh Docker chỉ chép backend/)', () => {
        expect(fs.existsSync(path.join(__dirname, '..', 'config', 'ngonNgu.json'))).toBe(true);
        expect(fs.readFileSync(path.join(__dirname, '..', 'config', 'ngonNgu.js'), 'utf8')).toMatch(/require\('\.\/ngonNgu\.json'\)/);
    });
});

describe('hàm của sổ', () => {
    test.each([
        ['日本語を勉強します', 'ja'],   // Kanji + kana → Nhật, không phải Trung
        ['カラオケ', 'ja'],
        ['你好，朋友', 'zh'],
        ['안녕하세요', 'ko'],
        ['Hello world', null],
        ['', null],
    ])('nhận diện chữ viết: %s → %s', (text, ma) => expect(N.nhanDienChuViet(text)).toBe(ma));

    test('chuẩn mã: chưa mở / lạ / rỗng → mặc định (giữ hành vi cũ)', () => {
        expect(N.chuanMa('zh')).toBe('zh');
        expect(N.chuanMa('ja')).toBe('en');
        expect(N.chuanMa('xx')).toBe('en');
        expect(N.chuanMa(undefined)).toBe('en');
    });

    test('ngôn ngữ đang học: bi → zh', () => {
        expect(N.ngonNguHoc('bi')).toBe('zh');
        expect(N.ngonNguHoc('zh')).toBe('zh');
        expect(N.ngonNguHoc('en')).toBe('en');
    });

    test('tên cho prompt, mã giọng, đơn vị đếm', () => {
        expect(N.tenChoPrompt('zh')).toBe('Chinese');
        expect(N.tenChoPrompt('ja')).toBe('Japanese');
        expect(N.bcp47('ko')).toBe('ko-KR');
        expect(N.giongEdge('zh')).toBe('zh-CN-XiaoxiaoNeural');
        expect(N.donViDem('zh')).toBe('chu');
        expect(N.tenChoPrompt('xx')).toBe('English');
    });
});

describe('enum DB sinh từ sổ', () => {
    test('không model nào còn liệt kê ngôn ngữ viết cứng; đều đọc từ sổ', () => {
        const dir = path.join(__dirname, '..', 'models');
        for (const f of fs.readdirSync(dir)) {
            const src = fs.readFileSync(path.join(dir, f), 'utf8');
            expect([f, /enum: \[\s*'en',\s*'zh'/.test(src)]).toEqual([f, false]);
            if (/MA_NGON_NGU/.test(src)) expect(src).toMatch(/require\('\.\.\/config\/ngonNgu'\)/);
        }
        expect(require('../models/Essay').schema.path('lang').enumValues).toEqual(N.MA_NGON_NGU);
        expect(require('../models/UserProfile').schema.path('settings.vocabLang').enumValues).toEqual(N.MA_NGON_NGU_BI);
    });

    test('thiết lập của người dùng: không tự đặt được ngôn ngữ chưa mở (enum DB đã nhận ja/ko)', () => {
        expect(N.locThietLap({ vocabLang: 'ja', theme: 'dark' })).toEqual({ theme: 'dark' });
        expect(N.locThietLap({ vocabLang: 'zh', theme: 'dark' })).toEqual({ vocabLang: 'zh', theme: 'dark' });
        expect(N.locThietLap({ vocabLang: 'bi' })).toEqual({ vocabLang: 'bi' });
        expect(N.locThietLap({ theme: 'dark' })).toEqual({ theme: 'dark' });
        for (const f of ['authController.js', 'userStateController.js']) {
            expect(fs.readFileSync(path.join(__dirname, '..', 'controllers', f), 'utf8')).toMatch(/locThietLap\((state\.)?settings\)/);
        }
    });
});

describe('tên ngôn ngữ trong prompt AI lấy từ sổ', () => {
    test("không còn ternary kiểu zh ? 'Chinese' : 'English' trong services/controllers", () => {
        const vi_pham = [];
        for (const thuMuc of ['services', 'controllers']) {
            const dir = path.join(__dirname, '..', thuMuc);
            for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
                const src = fs.readFileSync(path.join(dir, f), 'utf8');
                if (/\?\s*'(Mandarin )?Chinese'\s*:\s*'English'/.test(src) || /\?\s*'CHINESE'\s*:\s*'ENGLISH'/.test(src)) vi_pham.push(`${thuMuc}/${f}`);
            }
        }
        expect(vi_pham).toEqual([]);
    });
});

describe('lọc Mongo và mã kỹ năng theo ngôn ngữ', () => {
    const { locTheoNgonNgu, maKyNang } = require('../config/ngonNgu');
    test('mặc định lấy cả bản ghi cũ không có lang; ngôn ngữ khác lọc đúng mã', () => {
        expect(locTheoNgonNgu('en')).toEqual({ lang: { $nin: ['zh', 'ja', 'ko'] } });
        expect(locTheoNgonNgu('zh')).toEqual({ lang: 'zh' });
        expect(locTheoNgonNgu('bi')).toEqual(locTheoNgonNgu('en')); // giữ hành vi cũ: chỉ 'zh' mới lọc tiếng Trung
        expect(locTheoNgonNgu('ja')).toEqual(locTheoNgonNgu('en')); // chưa mở
    });
    test('mã kỹ năng: mặc định giữ tên gốc, ngôn ngữ khác thêm tiền tố', () => {
        expect(maKyNang('en', 'noi')).toBe('noi');
        expect(maKyNang('zh', 'nghe')).toBe('zh-nghe');
        expect(maKyNang(undefined, 'noi')).toBe('noi');
    });
});

describe('bảng nội dung theo ngôn ngữ', () => {
    const fs = require('fs');
    const path = require('path');
    const N = require('../config/ngonNgu');
    /** Nạp mọi file có khai `bangNgonNgu(` để bảng nào cũng được đăng ký. */
    const napHet = () => {
        const ds = [];
        for (const thu of ['services', 'controllers', 'routes']) {
            for (const ten of fs.readdirSync(path.join(__dirname, '..', thu))) {
                const p = path.join(__dirname, '..', thu, ten);
                if (ten.endsWith('.js') && fs.readFileSync(p, 'utf8').includes('bangNgonNgu(')) { require(p); ds.push(ten); }
            }
        }
        return ds;
    };

    test('mọi ngôn ngữ đang mở có đủ nội dung trong mọi bảng', () => {
        expect(napHet().length).toBeGreaterThan(5);
        for (const ma of N.NGON_NGU_HOAT_DONG) expect([ma, N.thieuNoiDung(ma)]).toEqual([ma, []]);
    });

    test('tra ngôn ngữ thiếu trong bảng: lỗi nêu rõ tên bảng, không âm thầm dùng tiếng Anh', () => {
        const tra = N.bangNgonNgu('Bảng thử', { en: 1 });
        expect(tra('en')).toBe(1);
        expect(() => tra('zh')).toThrow(/Bảng thử.*"zh"/);
        expect(tra('ja')).toBe(1); // chưa mở → chuẩn về mặc định như mọi chỗ khác
    });
});

describe('không còn ternary Anh–Trung cho mã / tên / đơn vị (backend)', () => {
    const fs = require('fs');
    const path = require('path');
    test('services, controllers, routes, models dùng hàm của sổ', () => {
        const MAU = [/=== 'zh' \? 'zh' : 'en'/, /\? 'tiếng Trung' : 'tiếng Anh'/, /=== 'zh' \? 'chữ' : 'từ'/, /\? \{ lang: 'zh' \} : \{ lang: \{/];
        const vi_pham = [];
        for (const thu of ['services', 'controllers', 'routes', 'models']) {
            for (const ten of fs.readdirSync(path.join(__dirname, '..', thu))) {
                if (!ten.endsWith('.js')) continue;
                const ma = fs.readFileSync(path.join(__dirname, '..', thu, ten), 'utf8')
                    .split('\n').filter((d) => !/^\s*(\/\/|\*|\/\*)/.test(d)).join('\n');
                for (const re of MAU) if (re.test(ma)) vi_pham.push(`${thu}/${ten}: ${re}`);
            }
        }
        expect(vi_pham).toEqual([]);
    });
});

describe('dữ liệu prompt của ngoại ngữ khác tiếng Anh', () => {
    const N = require('../config/ngonNgu');
    const MUC = ['easy', 'medium', 'hard'];
    test.each(N.MA_NGON_NGU.filter((m) => m !== N.MAC_DINH))('%s có đủ trường prompt', (ma) => {
        const p = N.layNgonNgu(ma).prompt;
        for (const k of ['vietBang', 'ghiChuChuViet', 'chiChuViet', 'doDaiNghe', 'diemDocHieu']) expect([k, typeof p[k]]).toEqual([k, 'string']);
        for (const k of ['doDaiDoc', 'capDo', 'capDoNghe']) for (const m of MUC) expect([k, m, typeof p[k][m]]).toEqual([k, m, 'string']);
    });
    test('tiếng Anh không có: prompt tiếng Anh viết riêng (CEFR/IELTS/TOEIC)', () => {
        expect(N.promptCua('en')).toBeNull();
        expect(N.promptCua('zh').vietBang).toBe('Simplified Chinese');
    });
});
