import EmptyState from './EmptyState.jsx';
import HistoryItem from './HistoryItem.jsx';
import Pagination from './Pagination.jsx';
import { useToeicHistory } from '../hooks/useToeicHistory.js';

export default function HistoryList({ active, onView, partFilter = 'new' }) {
    const { items, page, totalPages, loading, error, goToPage } = useToeicHistory({ enabled: active });
    // 'new' = không lọc Part. Lịch sử vốn đã phân trang theo thứ tự mới nhất
    // nên không cắt bớt như danh sách đề.
    const shown = partFilter === 'new'
        ? items
        : items.filter(a => a.testType === `mini-part${partFilter}`);

    if (loading && items.length === 0) {
        return (
            <div style={{ textAlign: 'center', padding: 40 }}>
                <i className="fas fa-spinner fa-spin fa-2x"></i>
            </div>
        );
    }

    if (error) {
        return <EmptyState title="Lỗi tải lịch sử" text="Vui lòng thử lại sau" />;
    }

    if (items.length === 0) {
        return (
            <EmptyState
                title="Chưa có lịch sử thi"
                text="Bắt đầu làm bài thi đầu tiên của bạn!"
            />
        );
    }

    if (shown.length === 0) {
        return <EmptyState title="Không có kết quả" text={`Chưa có lượt thi nào cho Part ${partFilter} ở trang này`} />;
    }

    return (
        <>
            <div className="toeic-history-list">
                {shown.map(attempt => (
                    <HistoryItem key={attempt._id} attempt={attempt} onView={onView} />
                ))}
            </div>
            <Pagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={goToPage}
            />
        </>
    );
}
