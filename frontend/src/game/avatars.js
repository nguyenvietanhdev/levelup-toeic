// Ảnh avatar KHÔNG hardcode ở đây — lấy từ DB (ItemDefinition.image, admin sửa được
// ở Catalog vật phẩm). Backend gửi kèm: equippedImages.avatar (state) / entry.avatarImage (BXH).

// Ảnh avatar cuối cùng để render: ưu tiên ảnh cosmetic ĐANG TRANG BỊ (từ DB),
// rồi tới ảnh user (Google/tải lên trước đây), cuối cùng null → dùng chữ cái đầu.
export function resolveAvatarSrc(cosmeticImage, userAvatar) {
    if (cosmeticImage) return cosmeticImage;
    if (userAvatar && (userAvatar.startsWith('data:image') || userAvatar.startsWith('http') || userAvatar.startsWith('/'))) {
        return userAvatar;
    }
    return null;
}
