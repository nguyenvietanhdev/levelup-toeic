import EmptyState from './EmptyState.jsx';
import TestCard from './TestCard.jsx';
import { sortTests } from './sortTests.js';
import { testSeriesName, testLevel, NEW_TESTS_LIMIT } from './testSeries.js';

export default function MiniTestList({ tests, loading, onStart, partFilter = 'new', sortBy = 'default', search = '', series = '', level = '' }) {
    if (loading) {
        return (
            <div style={{ textAlign: 'center', padding: 40 }}>
                <i className="fas fa-spinner fa-spin fa-2x"></i>
            </div>
        );
    }

    const q = search.trim().toLowerCase();
    let miniTests = sortTests(tests.filter(t =>
        t.testType?.startsWith('mini-part') && t.isPublished === true
        && (partFilter === 'new' || t.testType === `mini-part${partFilter}`)
        && (!series || testSeriesName(t) === series)
        && (!level || testLevel(t) === level)
        && (!q || (t.testName || t.title || '').toLowerCase().includes(q))
    ), sortBy);

    // Tab "New": chỉ vài đề mới nhất (server đã trả mới trước) — xem đủ thì lọc
    // Part hoặc chọn bộ đề. Đã chọn bộ đề thì hiện hết bộ đó, không cắt.
    if (partFilter === 'new' && !series) miniTests = miniTests.slice(0, NEW_TESTS_LIMIT);

    if (miniTests.length === 0) {
        return (
            <EmptyState
                title="Chưa có Mini Test nào được xuất bản"
                text="Admin cần tạo và xuất bản Mini Test trước"
            />
        );
    }

    return (
        <div className="toeic-tests-grid">
            {miniTests.map(test => (
                <TestCard key={test._id} test={test} onStart={onStart} />
            ))}
        </div>
    );
}
