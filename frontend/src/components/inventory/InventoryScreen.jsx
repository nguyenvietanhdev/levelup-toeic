import { useGame } from '@game/GameContext.jsx';
import InventoryWardrobe from './InventoryWardrobe.jsx';

/**
 * Túi đồ — MÀN RIÊNG, không còn là hộp thoại trong Cửa hàng.
 *
 * Trước đây chỉ mở được từ bên trong màn Cửa hàng, nên muốn đổi avatar hay bật
 * thẻ tăng tốc là phải đi vòng qua chỗ bán hàng. Hai việc khác hẳn nhau: Cửa
 * hàng là TIÊU tiền, Túi đồ là thứ mình ĐANG CÓ. Dấu hiệu rõ nhất của việc đặt
 * sai chỗ: màn Hồ sơ từng phải chú thích "Đổi ảnh đại diện trong Túi đồ (Cửa
 * hàng)" — giao diện phải giải thích đường đi của chính nó.
 *
 * Không hiện lại số xu/gem/⚡ ở đây như bản modal: thanh trạng thái phía trên
 * đã có sẵn, lặp lần nữa chỉ tốn chỗ.
 */
export default function InventoryScreen({ active }) {
    const { showScreen } = useGame();

    return (
        <div id="inventory-screen" className={`screen ${active ? 'active' : ''}`}>
            <div className="screen-header">
                <button className="back-btn-screen icon-btn" onClick={() => showScreen('home-screen')}>
                    <i className="fas fa-arrow-left"></i>
                </button>
                <h2><i className="fas fa-briefcase"></i> Túi đồ</h2>
                <button
                    className="inventory-btn"
                    style={{ marginLeft: 'auto' }}
                    title="Sang Cửa hàng mua thêm"
                    onClick={() => showScreen('shop-screen')}
                >
                    <i className="fas fa-shopping-cart"></i> Cửa hàng
                </button>
            </div>

            <InventoryWardrobe />
        </div>
    );
}
