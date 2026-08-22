/**
 * Reset mùa giải — nhóm dữ liệu nào bị xoá.
 *
 * Đọc mã nguồn thay vì chạy hàm: `resetByBuckets` gọi `deleteMany` trên hơn
 * mười model thật, dựng đủ chúng để chạy một lần là công lớn hơn thứ nó kiểm.
 * Điều cần giữ ở đây là "collection X có nằm trong nhóm Y không" — một câu hỏi
 * đọc thẳng ra được, và là câu hỏi mà sót một dòng thì không lỗi nào báo: mùa
 * mới bắt đầu với dữ liệu mùa cũ còn nguyên, và chỉ người dùng phát hiện ra.
 */
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const src = readFileSync(join(__dirname, '..', 'services', 'seasonService.js'), 'utf8');

/** Thân của một nhánh `if (buckets.X)`. */
function nhom(ten) {
    const i = src.indexOf(`if (buckets.${ten})`);
    expect(i).toBeGreaterThan(-1);
    // Tới đầu nhánh kế tiếp, hoặc hết hàm.
    const j = src.indexOf('\n    if (buckets.', i + 10);
    return src.slice(i, j > 0 ? j : src.indexOf('\n}', i));
}

describe('nhóm "Học tập + Nội dung upload"', () => {
    test('XOÁ toàn bộ từ vựng đã sai', () => {
        // Từ sai là tiến trình học của mùa: sang mùa mới mà danh sách còn
        // nguyên thì lịch ôn giãn cách trỏ vào những từ thuộc về mùa trước, và
        // bảng xếp hạng mùa mới không còn công bằng giữa người cũ với người mới.
        expect(nhom('learning')).toMatch(/WrongWord\.deleteMany\(\{\}\)/);
    });

    test('xoá cả từ vựng người dùng tự tải lên và danh sách yêu thích', () => {
        const b = nhom('learning');
        expect(b).toMatch(/UserUpload\.deleteMany\(\{\}\)/);
        expect(b).toMatch(/favoriteWords: \[\]/);
    });
});

describe('mỗi nhóm chỉ xoá thứ thuộc về nó', () => {
    test('từ sai KHÔNG bị xoá theo nhóm thống kê', () => {
        // Người chỉ tick "Thống kê" mà mất luôn danh sách từ sai là mất dữ liệu
        // ngoài ý muốn — và không có cách nào lấy lại.
        expect(nhom('stats')).not.toMatch(/WrongWord/);
    });

    test('mọi nhánh reset đều nằm sau một `buckets.*`', () => {
        // `deleteMany` đứng ngoài mọi nhánh thì nó chạy với MỌI lựa chọn, kể cả
        // khi người dùng bỏ tick hết.
        for (const m of src.matchAll(/(\w+)\.deleteMany\(\{\}\)/g)) {
            const truoc = src.slice(0, m.index);
            const iNhanh = truoc.lastIndexOf('if (buckets.');
            const iHam = truoc.lastIndexOf('\nasync function');
            expect(iNhanh).toBeGreaterThan(iHam);
        }
    });
});
