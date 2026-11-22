/**
 * Ô tìm bài trên thanh tiêu đề của thư viện (Bài nghe, Học qua bài hát). Lọc ngay trên máy, không
 * gọi server: danh sách đã tải về đủ.
 */
export default function OTimBai({ value, onChange, placeholder = 'Tìm bài…' }) {
    return (
        <label className="bn-tim">
            <i className="fas fa-magnifying-glass" aria-hidden="true"></i>
            <input
                type="search"
                value={value}
                maxLength={80}
                autoComplete="off"
                aria-label="Tìm bài"
                placeholder={placeholder}
                onChange={(e) => onChange(e.target.value)}
            />
            {value && (
                <button type="button" className="bn-tim-xoa" aria-label="Xoá nội dung tìm" onClick={() => onChange('')}>
                    <i className="fas fa-xmark"></i>
                </button>
            )}
        </label>
    );
}
