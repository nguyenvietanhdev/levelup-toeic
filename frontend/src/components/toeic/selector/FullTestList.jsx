import EmptyState from './EmptyState.jsx';
import TestCard from './TestCard.jsx';
import { isFullTestType } from '../toeicPartTime.js';

export default function FullTestList({ tests, loading, onStart, selectedId = '' }) {
    if (loading) {
        return (
            <div style={{ textAlign: 'center', padding: 40 }}>
                <i className="fas fa-spinner fa-spin fa-2x"></i>
            </div>
        );
    }

    // isFullTestType: backend đặt cả 'full' lẫn 'full-test', so tay một chuỗi sẽ sót.
    // selectedId rỗng = xem hết; chọn một đề trên thanh menu thì chỉ còn đề đó.
    const fullTests = tests.filter(t =>
        isFullTestType(t) && (!selectedId || String(t._id) === String(selectedId)),
    );

    if (fullTests.length === 0) {
        return (
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
