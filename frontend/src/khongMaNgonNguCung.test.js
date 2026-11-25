/**
 * Mã giọng 'zh-CN' / 'en-US' viết cứng chỉ được còn ở sổ ngôn ngữ và các chỗ ngoại lệ có lý do.
 *
 * Vì sao: kiểu `lang === 'zh' ? 'zh-CN' : 'en-US'` làm ngôn ngữ thứ ba (Nhật, Hàn…) âm thầm đọc
 * bằng giọng Anh. Mã giọng phải lấy từ sổ (`bcp47(lang)` ở lib/ngonNgu.js) — đổi một nơi, mọi nơi theo.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const GOC = __dirname;

/** Chỗ được giữ mã viết cứng — mỗi chỗ một lý do. Thêm vào đây phải có lý do thật. */
const NGOAI_LE = {
    'lib/ngonNgu.js': 'chính là sổ',
    'lib/speechInput.js': 'bảng mã Google Dịch → Web Speech (cả vi, ja, fr…), không phải ngôn ngữ đang học',
    'lib/giongTrinhDuyet.js': 'chọn giọng của trình duyệt theo mã BCP-47 đã có',
    'components/translate/TranslateModal.jsx': 'Dịch nhanh dùng mã Google Dịch, nhiều ngôn ngữ ngoài sổ',
    'lib/nhanKho.js': 'chế độ song ngữ Trung–Anh ghép cặp giọng hai mặt thẻ (kèm vi-VN)',
    'game/gameLogic.js': 'bộ máy đọc: nhận hệ chữ (cả vi-VN), chọn giọng trình duyệt dự phòng theo mã đã có',
    'game/config.js': 'giá trị mặc định cấu hình nhận dạng phát âm (ghi đè lúc chạy)',
    'components/settings/SettingsScreen.jsx': 'nút thử giọng Anh / Trung: biết chắc ngôn ngữ',
    'components/toeic/hooks/useToeicAudio.js': 'audio đề TOEIC luôn là tiếng Anh',
    'components/practice/modes/dictation.js': 'đã kiểm có chữ Hán ngay trước đó: biết chắc là tiếng Trung',
    'components/favorites/FavoritesModal.jsx': 'giá trị mặc định khi bản ghi không mang mã giọng',
    'components/vocab/upload/openUploadModal.js': 'giá trị mặc định khi nút không mang mã giọng',
};

function quet(dir, out = []) {
    for (const ten of readdirSync(dir)) {
        const p = join(dir, ten);
        if (statSync(p).isDirectory()) quet(p, out);
        else if (/\.(js|jsx)$/.test(ten) && !/\.test\.(js|jsx)$/.test(ten)) out.push(p);
    }
    return out;
}

describe('mã giọng lấy từ sổ ngôn ngữ', () => {
    test("không còn 'zh-CN' / 'en-US' viết cứng ngoài các chỗ ngoại lệ", () => {
        const vi_pham = [];
        for (const p of quet(GOC)) {
            const rel = relative(GOC, p).replace(/\\/g, '/');
            if (NGOAI_LE[rel]) continue;
            // Bỏ dòng chú thích: nhiều chú thích nhắc tên mã để giải thích vì sao KHÔNG viết cứng.
            const ma = readFileSync(p, 'utf8').split('\n').filter((d) => !/^\s*(\/\/|\*|\/\*)/.test(d)).join('\n');
            if (/'zh-CN'|'en-US'/.test(ma)) vi_pham.push(rel);
        }
        expect(vi_pham).toEqual([]);
    });

    test('mọi ngoại lệ còn tồn tại (xoá file thì gỡ khỏi danh sách)', () => {
        for (const rel of Object.keys(NGOAI_LE)) {
            expect(() => statSync(join(GOC, rel))).not.toThrow();
        }
    });
});
