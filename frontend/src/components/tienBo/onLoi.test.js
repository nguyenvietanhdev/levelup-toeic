/**
 * Kiểm tra lại lỗi đã chữa (giao diện).
 *
 * Chỗ dễ hỏng, đều im lặng:
 *   1. Danh sách Sổ tay lỗi vẫn hiện trong lúc làm buổi ôn → lộ sẵn cách sửa.
 *   2. Chọn từ gửi sai vị trí ký tự (server chấm theo vị trí trong câu).
 *   3. Enter ở ô tìm kiếm nộp nhầm câu trả lời.
 *   4. Tự chấm ở trình duyệt (đáp án phải ở server).
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NHOM_PHIM_TAT } from '@lib/phimTat.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const doc = (...p) => readFileSync(join(__dirname, '..', '..', ...p), 'utf8');
const ol = doc('components', 'tienBo', 'OnLoi.jsx');
const stl = doc('components', 'tienBo', 'SoTayLoi.jsx');

describe('gắn vào Sổ tay lỗi', () => {
    test('đang làm buổi ôn thì ẩn danh sách lỗi', () => {
        expect(stl).toMatch(/<OnLoi active=\{active\} onDangLam=\{setDangOn\} \/>/);
        expect(stl).toMatch(/\{!dangOn && <DanhSachLoi active=\{active\} \/>\}/);
        expect(ol).toMatch(/useEffect\(\(\) => \{ onDangLam\?\.\(!!buoi\); \}, \[buoi, onDangLam\]\);/);
    });
});

describe('trả lời', () => {
    test('mảnh bấm giữ VỊ TRÍ ký tự thật; tiếng Trung theo từng chữ', () => {
        expect(ol).toMatch(/const re = lang === 'zh' \? \/\\S\/gu : \/\\S\+\/g;/);
        expect(ol).toMatch(/out\.push\(\{ chu: m\[0\], start: m\.index, end: m\.index \+ m\[0\]\.length \}\)/);
        expect(ol).toMatch(/return ds\.length \? \{ start: ds\[0\]\.start, end: ds\[ds\.length - 1\]\.end \} : null;/);
    });

    test('đáp án đến từ server — trình duyệt không tự chấm', () => {
        expect(ol).toMatch(/const r = await OnLoiAPI\.traLoi\(buoi\.id, i, body\);/);
        expect(ol).not.toMatch(/khopSua|chamTimLoi/);
        expect(doc('api', 'onLoi.js')).toMatch(/Http\.post\(`\/on-loi\/buoi\/\$\{encodeURIComponent\(id\)\}\/cau\/\$\{i\}`, body\)/);
    });

    test('Enter chỉ nhận ở ô trả lời của buổi, không cướp ô tìm kiếm', () => {
        expect(ol).toMatch(/if \(o && !o\.classList\.contains\('ol-nhap'\)\) return;/);
    });

    test('hiện nhãn "Đã nắm" / "Nghi học vẹt" theo trạng thái server trả', () => {
        expect(ol).toMatch(/\{t\?\.moiDaNam && /);
        expect(ol).toMatch(/\{t\?\.moiNghiHocVet && \(/);
    });
});

test('sổ tay phím tắt có nhóm Kiểm tra lại lỗi', () => {
    expect(NHOM_PHIM_TAT.find((n) => n.key === 'on-loi')?.screens).toEqual(['tien-bo-screen']);
});
