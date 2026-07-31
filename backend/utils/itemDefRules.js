/**
 * Quy tắc thuần cho catalog vật phẩm (không DB, không req/res) — tách ra để test
 * được, vì hai quy tắc dưới đây từng âm thầm làm hỏng dữ liệu thật:
 *
 *  - `type` là thứ TÚI ĐỒ lọc theo để chia tab. Suy sai → item vẫn nằm trong DB
 *    nhưng người chơi không thấy đâu cả.
 *  - Thẻ boost mà `boostType` sai thì applyShopEffect không khớp nhánh nào: thẻ
 *    bị tiêu mà chẳng có gì bật.
 */

// category → `type`. Chỉ liệt kê danh mục có tab/logic riêng.
const CATEGORY_TYPE = {
    avatar: 'cosmetic_avatar',
    background: 'cosmetic_background',
    frame: 'cosmetic_frame',
    boost: 'boost',
    consumable: 'consumable',
    ticket: 'consumable',   // vé quay nằm ở tab "Tiêu hao"
};

/**
 * Suy `type` từ category. Danh mục không có tab riêng thì GIỮ NGUYÊN type cũ,
 * không hạ về 'item' — vài item cũ mang type riêng ('service') và ghi đè chúng
 * chỉ tạo rủi ro chứ không được gì.
 */
const deriveType = (category, current) => CATEGORY_TYPE[category] || current || 'item';

const BOOST_TYPES = ['xp', 'coins', 'energy'];

/**
 * Kiểm tra effect trước khi lưu. Trả về chuỗi lỗi (tiếng Việt) hoặc null nếu ổn.
 * Hiện chỉ soi thẻ boost — loại effect duy nhất từng lưu được dữ liệu chết.
 */
function badEffect(effect) {
    if (effect?.type !== 'boost') return null;
    if (!BOOST_TYPES.includes(effect.boostType)) {
        return `Thẻ boost phải có boostType là một trong: ${BOOST_TYPES.join(', ')} (đang là "${effect.boostType ?? ''}")`;
    }
    if (!(Number(effect.multiplier) > 1)) return 'Hệ số boost phải lớn hơn 1';
    if (!(Number(effect.duration) > 0)) return 'Thời lượng boost phải lớn hơn 0 giây';
    return null;
}

/**
 * Vật phẩm bày bán mà KHÔNG có danh mục thì không kênh nào thấy nó: cửa hàng lọc
 * `category ∈ ChannelConfig.categories`, danh mục rỗng không khớp gì cả. Trước
 * đây lưu được, và gói "Nạp đầy năng lượng" đã mất khỏi cửa hàng đúng vì vậy.
 * @param {object} doc  { category, published, price }
 * @returns {string|null} lý do từ chối, hoặc null nếu ổn
 */
function badListing({ category, published, price } = {}) {
    if (published === false) return null;              // để nháp thì cho phép
    if (!(Number(price) > 0)) return null;             // không bán thì không cần danh mục
    if (String(category || '').trim()) return null;
    return 'Vật phẩm có giá và đang xuất bản thì PHẢI có danh mục — để trống là không kênh nào (cửa hàng/vòng quay/nhiệm vụ) hiển thị được.';
}

module.exports = { CATEGORY_TYPE, BOOST_TYPES, deriveType, badEffect, badListing };
