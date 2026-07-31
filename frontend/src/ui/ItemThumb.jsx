// Hiển thị "ảnh vật phẩm nếu có, không thì icon". Dùng chung cho shop / túi đồ / vòng quay.
// - Có `image`: render <img>; nếu ảnh lỗi/thiếu file → tự ẩn ảnh, hiện `children` (icon dự phòng).
// - Không có `image`: render thẳng `children` (icon).
// `children` là node icon tuỳ nơi: emoji (chuỗi) hoặc <i class="fas fa-...">.
export default function ItemThumb({ image, imgClassName, children }) {
    if (!image) return children;
    return (
        <>
            <img
                src={image}
                alt=""
                className={imgClassName}
                onError={e => {
                    e.currentTarget.style.display = 'none';
                    if (e.currentTarget.nextSibling) e.currentTarget.nextSibling.style.display = '';
                }}
            />
            <span style={{ display: 'none' }}>{children}</span>
        </>
    );
}
