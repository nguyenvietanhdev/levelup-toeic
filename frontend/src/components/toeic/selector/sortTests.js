// Sắp xếp danh sách đề TOEIC — dùng chung cho Mini Test và Đục lỗ.
// 'default' giữ nguyên thứ tự server trả về (mới nhất trước).
export function sortTests(list, sortBy) {
    if (!sortBy || sortBy === 'default') return list;
    const arr = [...list];
    const name = t => (t.testName || t.title || '');
    const att = t => t.timesAttempted || 0;
    // numeric:true → "TEST 2" đứng trước "TEST 10" (so sánh phần số như SỐ, không
    // phải từng ký tự — nếu không "10" lọt giữa "1" và "2").
    const byName = (a, b) => name(a).localeCompare(name(b), undefined, { numeric: true, sensitivity: 'base' });
    switch (sortBy) {
        case 'name-asc':       return arr.sort(byName);
        case 'name-desc':      return arr.sort((a, b) => byName(b, a));
        case 'attempts-desc':  return arr.sort((a, b) => att(b) - att(a));
        case 'attempts-asc':   return arr.sort((a, b) => att(a) - att(b));
        default:               return arr;
    }
}
