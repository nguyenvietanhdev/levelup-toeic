// Quy tắc hiển thị danh sách đề, để ở đây (không phải ToeicScreen) vì cả
// MiniTestList lẫn FillBlankList đều cần — nhập ngược từ ToeicScreen sẽ tạo
// vòng import, lúc đó hằng số có thể là undefined ngay khi module vừa nạp.
export const NEW_TESTS_LIMIT = 9;

// Gom đề theo BỘ (ETS 2026, ETS 2025…). Tên đề đặt theo mẫu
// "<bộ> TEST <n>" / "<bộ> FULL TEST <n>" nên cắt phần đuôi là ra tên bộ —
// không cần thêm trường mới trong DB.
// Có đề còn đặt kèm "- PART 2" ở cuối ("ETS 2026 TEST 4 - PART 2"); không cắt
// nốt đuôi đó thì mỗi đề như vậy tự thành MỘT bộ riêng, đổ rác vào ô lọc.
const SERIES_RE = /^(.*?)\s*(?:FULL\s+)?TEST\s*\d+\s*(?:[-–—]\s*PART\s*\d+\s*)?$/i;

export function testSeriesName(test) {
    const name = (test?.testName || test?.title || '').trim();
    if (!name) return '';
    return (name.match(SERIES_RE)?.[1] || name).trim();
}

/** Danh sách bộ đề có mặt trong `tests`, mới nhất trước (ETS 2026 → 2022). */
export function listTestSeries(tests = []) {
    const set = new Set(tests.map(testSeriesName).filter(Boolean));
    return [...set].sort((a, b) =>
        b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }),
    );
}

// ── Danh mục bộ đề do admin khai (ToeicSeries) ──────────────────────────────
// Khớp theo TIỀN TỐ source key, cùng luật với backend/utils/toeicSeries.js.
// Đây là đường CHÍNH; phần cắt tên đề bên trên chỉ còn là đường lui khi admin
// chưa khai bộ nào (xem buildSeriesChips).

/** Chuẩn hoá tiền tố: nhận mảng hoặc chuỗi "a, b"; trim + lowercase, bỏ rỗng/trùng. */
export function normalizeKeys(raw) {
    if (!raw) return [];
    const arr = Array.isArray(raw) ? raw : String(raw).split(',');
    return [...new Set(
        arr.map(s => String(s ?? '').trim().toLowerCase()).filter(Boolean),
    )];
}

/** Nguồn của một đề — gộp `sources[]` và `source`; chỉ đọc `source` sẽ sót đề trộn. */
function testSources(test) {
    const raw = [...(Array.isArray(test?.sources) ? test.sources : []), test?.source];
    return raw.map(s => String(s ?? '').trim().toLowerCase()).filter(Boolean);
}

/** Đề có nguồn nào bắt đầu bằng một trong `keys` không. */
export function testMatchesKeys(test, keys) {
    const list = normalizeKeys(keys);
    if (!list.length) return false;
    return testSources(test).some(src => list.some(k => src.startsWith(k)));
}

/** Id của nút gom các đề chưa thuộc bộ nào. */
export const OTHER_CHIP_ID = '__other__';

/**
 * Dựng danh sách nút lọc.
 *
 * - Có danh mục → hiện MỌI bộ đang bật, kể cả bộ chưa có đề nào ở tab này; bấm
 *   vào thì danh sách tự báo "chưa có đề". Ẩn bộ rỗng đi thì admin khai xong
 *   không thấy bộ đâu, tưởng mình khai hụt — mà đó mới là lúc cần thấy nhất.
 *   Thêm nút "Khác" nếu còn đề chưa thuộc bộ nào, để không đề nào biến mất.
 * - Chưa khai bộ nào → lui về cắt tên đề như cũ, để thanh lọc không trống trơn
 *   ngay lúc tính năng vừa lên.
 */
export function buildSeriesChips(tests = [], catalog = []) {
    if (catalog.length) {
        const chips = catalog.map(s => ({
            id: String(s._id), label: s.displayName, keys: s.keys,
        }));
        const ungrouped = tests.some(t => !catalog.some(s => testMatchesKeys(t, s.keys)));
        if (ungrouped) chips.push({ id: OTHER_CHIP_ID, label: 'Khác', keys: null });
        return chips;
    }
    return listTestSeries(tests).map(name => ({ id: `name:${name}`, label: name, name }));
}

/**
 * Một đề có thuộc nút lọc đang chọn không. `chip` rỗng = không lọc.
 * Dùng trực tiếp khi danh sách đã có sẵn chuỗi điều kiện khác (Mini Test / Đục lỗ
 * còn lọc theo Part, độ khó, từ khoá) — khỏi lọc hai lượt.
 */
export function matchesChip(test, chip = null, catalog = []) {
    if (!chip) return true;
    if (chip.id === OTHER_CHIP_ID) return !catalog.some(s => testMatchesKeys(test, s.keys));
    if (chip.keys) return testMatchesKeys(test, chip.keys);
    if (chip.name) return testSeriesName(test) === chip.name; // đường lui: khớp theo tên
    return true;
}

/** Lọc đề theo nút đang chọn. `chip` rỗng = xem hết. */
export function filterByChip(tests = [], chip = null, catalog = []) {
    return tests.filter(t => matchesChip(t, chip, catalog));
}

// Độ khó đọc từ `level` (beginner/intermediate/advanced) — đây là trường THẬT
// trong ToeicTest. `difficulty` không có trong schema, nhãn "MEDIUM" trên thẻ đề
// chỉ là giá trị mặc định cứng ở TestCard nên không lọc theo nó được.
export const TEST_LEVELS = [
    { key: 'beginner', label: 'Cơ bản' },
    { key: 'intermediate', label: 'Trung bình' },
    { key: 'advanced', label: 'Nâng cao' },
];

export function testLevel(test) {
    return test?.level || 'intermediate';
}

/** Các mức độ khó CÓ THẬT trong danh sách — không đổ ra mức không đề nào dùng. */
export function listTestLevels(tests = []) {
    const present = new Set(tests.map(testLevel));
    return TEST_LEVELS.filter(l => present.has(l.key));
}
