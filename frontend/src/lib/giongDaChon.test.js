/**
 * Giọng đã chọn trong Cài đặt phải được dùng ở MỌI chỗ phát âm.
 *
 * Popup Dịch nhanh trước đây gọi `/api/tts` bằng mã chung ('en'/'zh') nên luôn
 * ra giọng mặc định — chọn Guy hay Yunxi ở Cài đặt cũng không đổi được gì.
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { maGiongDaChon, MA_GIONG } from './giongDaChon.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** localStorage giả — jsdom có sẵn nhưng ta cần kiểm cả ca nó NÉM lỗi. */
const datGiong = (khoa, gia) => {
    const kho = {};
    if (khoa) kho[khoa] = gia;
    vi.stubGlobal('localStorage', {
        getItem: (k) => kho[k] ?? null,
        setItem: () => {},
    });
};

beforeEach(() => vi.unstubAllGlobals());

describe('trả giọng người dùng đã chọn', () => {
    test('giọng Anh đã chọn', () => {
        datGiong('toeic_voice_en', '__gtts_uk_m__');
        expect(maGiongDaChon('en')).toBe('en-gb-m');
    });

    test('giọng Trung đã chọn', () => {
        datGiong('toeic_voice_zh', '__gtts_zh_yunxi__');
        expect(maGiongDaChon('zh')).toBe('zh-cn-yunxi');
    });

    test('giọng Việt đã chọn', () => {
        datGiong('toeic_voice_vi', '__gtts_vi_m__');
        expect(maGiongDaChon('vi')).toBe('vi-vn-m');
    });
});

describe('không gán giọng SAI hệ chữ', () => {
    test('chọn giọng Anh, đọc chữ Hán → dùng giọng Trung', () => {
        // Gán giọng Anh cho câu chữ Hán thì máy đọc từng ký tự như chữ cái.
        datGiong('toeic_voice_zh', '__gtts_us__');
        expect(maGiongDaChon('zh')).toBe('zh-cn-random');
    });

    test('chọn giọng Trung, đọc chữ Latin → dùng giọng Anh', () => {
        datGiong('toeic_voice_en', '__gtts_zh_xiaoyi__');
        expect(maGiongDaChon('en')).toBe('en-random');
    });
});

describe('chưa chọn gì thì có mặc định', () => {
    test('mỗi hệ chữ một mặc định riêng', () => {
        datGiong(null);
        expect(maGiongDaChon('en')).toBe('en-random');
        expect(maGiongDaChon('zh')).toBe('zh-cn-random');
        expect(maGiongDaChon('vi')).toBe('vi-random');
    });

    test('khoá CŨ `toeic_voice` vẫn dùng được', () => {
        // Hồ sơ chưa đổi sang khoá tách theo ngôn ngữ.
        datGiong('toeic_voice', '__gtts_au__');
        expect(maGiongDaChon('en')).toBe('en-au-f');
    });

    test('localStorage NÉM lỗi vẫn không vỡ', () => {
        // Chế độ riêng tư chặn đọc.
        vi.stubGlobal('localStorage', {
            getItem: () => { throw new Error('chan'); },
            setItem: () => {},
        });
        expect(maGiongDaChon('en')).toBe('en-random');
    });

    test('giọng lạ (đã gỡ khỏi Cài đặt) rơi về mặc định', () => {
        datGiong('toeic_voice_en', '__gtts_khong_ton_tai__');
        expect(maGiongDaChon('en')).toBe('en-random');
    });
});

describe('bảng dùng CHUNG, không chép rời', () => {
    test('`gameLogic` dùng chính bảng này', () => {
        // Hai bản chép rời thì thêm giọng mới ở Cài đặt phải nhớ sửa cả hai chỗ.
        const gl = readFileSync(join(__dirname, '..', 'game', 'gameLogic.js'), 'utf8');
        expect(gl).toMatch(/import \{ MA_GIONG \} from '@lib\/giongDaChon\.js'/);
        expect(gl).toMatch(/const accentMap = MA_GIONG;/);
    });

    test('popup Dịch nhanh dùng giọng đã chọn', () => {
        const tm = readFileSync(join(
            __dirname, '..', 'components', 'translate', 'TranslateModal.jsx'), 'utf8');
        expect(tm).toMatch(/maGiongDaChon\(heChu\)/);
        // Không còn truyền mã chung.
        expect(tm).not.toMatch(/synthesize\([^)]*tl === 'en' \? 'en' : 'zh'/);
    });

    test('popup phục vụ cả tiếng Việt', () => {
        const tm = readFileSync(join(
            __dirname, '..', 'components', 'translate', 'TranslateModal.jsx'), 'utf8');
        expect(tm).toMatch(/tl === 'en' \|\| tl === 'zh-CN' \|\| tl === 'vi'/);
    });

    test('MỌI giọng ở Cài đặt đều có trong bảng', () => {
        // Thiếu một khoá là mất một giọng, im lặng.
        const sp = readFileSync(join(
            __dirname, '..', 'components', 'settings', 'panels', 'SoundPanel.jsx'), 'utf8');
        const oCaiDat = [...new Set(
            [...sp.matchAll(/value="(__gtts_[a-z_]*__)"/g)].map((m) => m[1])
        )];
        expect(oCaiDat.length).toBeGreaterThan(10);
        for (const v of oCaiDat) expect(MA_GIONG).toHaveProperty(v);
    });
});

describe('thu âm nghe đúng ngôn ngữ', () => {
    test('kho song ngữ nghe tiếng TRUNG, không phải Anh', () => {
        // Đổi sang Trung–Anh, bấm Shift nói 你好, mà bộ nhận diện đang nghe
        // tiếng Anh thì ra một chuỗi Latin vô nghĩa — không lỗi nào báo.
        const si = readFileSync(join(__dirname, 'speechInput.js'), 'utf8');
        const i = si.indexOf('export function speechLangFor');
        const t = si.slice(i, si.indexOf('\n}', i));
        expect(t).toMatch(/vocabLang === 'zh' \|\| vocabLang === 'bi'/);
    });

    test('chế độ Phát âm quyết theo TỪ, không theo kho', () => {
        const pm = readFileSync(join(
            __dirname, '..', 'components', 'practice', 'modes', 'pronunciationMode.js'), 'utf8');
        const i = pm.indexOf('    _isZh() {');
        const t = pm.slice(i, pm.indexOf('\n    },', i));
        expect(t).toMatch(/this\.questions\?\.\[this\.currentIndex\]\?\.word/);
        expect(t).toMatch(/test\(chu\)/);
    });
});
