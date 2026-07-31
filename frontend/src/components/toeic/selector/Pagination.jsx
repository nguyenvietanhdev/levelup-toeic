export default function Pagination({ currentPage, totalPages, onPageChange }) {
    if (totalPages <= 1) return null;

    const pages = [];
    for (let i = 1; i <= totalPages; i++) pages.push(i);

    return (
        <div
            className="toeic-history-pagination"
            style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 20, padding: 20 }}
        >
            <button
                className="history-page-btn"
                disabled={currentPage === 1}
                onClick={() => onPageChange(currentPage - 1)}
            >
                <i className="fas fa-chevron-left"></i> Trước
            </button>
            {pages.map(p => (
                <button
                    key={p}
                    className={`history-page-btn ${p === currentPage ? 'active' : ''}`}
                    onClick={() => onPageChange(p)}
                >
                    {p}
                </button>
            ))}
            <button
                className="history-page-btn"
                disabled={currentPage === totalPages}
                onClick={() => onPageChange(currentPage + 1)}
            >
                Sau <i className="fas fa-chevron-right"></i>
            </button>
        </div>
    );
}
