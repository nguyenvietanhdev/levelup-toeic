import EmptyState from './EmptyState.jsx';
import TestCard from './TestCard.jsx';
import { isFullTestType } from '../toeicPartTime.js';
import { filterByChip } from './testSeries.js';

export default function FullTestList({ tests, loading, onStart, chip = null, catalog = [] }) {
    if (loading) {
        return (
            <div style={{ textAlign: 'center', padding: 40 }}>
                <i className="fas fa-spinner fa-spin fa-2x"></i>
            </div>
        );
    }

    // isFullTestType: backend đặt cả 'full' lẫn 'full-test', so tay một chuỗi sẽ sót.
    // chip rỗng = xem hết; chọn một bộ trên thanh menu thì còn MỌI đề của bộ đó.
    const fullTests = filterByChip(tests.filter(isFullTestType), chip, catalog);

    // Rỗng vì đang lọc một bộ thì nói thẳng là bộ đó chưa có đề — báo chung
    // "hệ thống đang cập nhật" sẽ khiến người dùng tưởng kho trống hẳn.
    if (fullTests.length === 0) {
        return chip ? (
            <EmptyState
                title={`Bộ ${chip.label} chưa có Full Test nào`}
                text="Chọn bộ khác, hoặc bấm “Tất cả” để xem toàn bộ đề"
            />
        ) : (
            <EmptyState
                title="Chưa có bài thi Full Test"
                text="Hệ thống đang cập nhật các bài thi mới"
            />
        );
    }

    return (
        <div className="toeic-tests-grid">
            {fullTests.map(test => (
                <TestCard key={test._id} test={test} onStart={onStart} />
            ))}
        </div>
    );
}
