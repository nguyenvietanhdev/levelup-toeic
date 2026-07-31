/**
 * Mua năng lượng NGAY TẠI CHỖ hết năng lượng — khỏi phải mở cửa hàng.
 *
 * Vì sao không tự trừ xu ở client: server BỎ QUA mọi thay đổi tiền tệ gửi lên
 * qua saveState (xem userStateController — "KHÔNG tin client về tiền tệ"),
 * nhưng lại NHẬN energy. Bản cũ trừ xu ở client rồi cộng energy → server chỉ
 * ghi nhận phần cộng energy, phần trừ xu bay mất = năng lượng miễn phí.
 * Ở đây tiền do SERVER trừ qua POST /shop/purchase (atomic), client chỉ đọc
 * lại `newBalance` server trả về.
 *
 * Gói bán lấy thẳng từ catalog (vật phẩm có effect.type = 'energy') nên đổi
 * giá / số lượng trong admin là chỗ này đổi theo, không hardcode.
 */
import { GameState } from '@game/state.js';
import { Utils } from '@lib/utils.js';
import { Config } from '@game/config.js';
import { Notification } from '@ui/Toaster.jsx';
import { Modal } from '@ui/Modal.jsx';
import { API } from '@/api/http.js';
import { ShopCatalogAPI } from '@/api/shopCatalog.js';

let _packsCache = null;

export const EnergyShop = {
    /**
     * Các gói năng lượng đang bày bán, rẻ trước.
     *
     * Hai kiểu gói: cộng thêm N⚡ (`effect.type === 'energy'`) và nạp ĐẦY BÌNH
     * (`energy_full`) — loại sau không có `amount` vì trần năng lượng mỗi người
     * mỗi khác, server tự set về maxEnergy.
     */
    async loadPacks({ force = false } = {}) {
        if (_packsCache && !force) return _packsCache;
        const res = await ShopCatalogAPI.items();
        // GET /api/shop/items trả về { success, items } — đọc nhầm sang `data`
        // là popup luôn báo "chưa bày bán gói nào" dù cửa hàng có hàng thật.
        // Vẫn nhận `data` để phòng endpoint đổi shape sau này.
        const items = res?.success
            ? (Array.isArray(res.items) ? res.items : (Array.isArray(res.data) ? res.data : []))
            : [];
        _packsCache = items
            // Loại THẺ (on_use): mua về nằm trong túi chờ kích hoạt, không hồi ⚡
            // ngay — bày ở popup "hết năng lượng" thì người chơi trả tiền mà
            // không vào được bài, còn popup lại báo "Đã nạp năng lượng".
            .filter(it => it?.durationType !== 'on_use')
            .filter(it => (it?.effect?.type === 'energy' && it.effect.amount > 0)
                || it?.effect?.type === 'energy_full')
            .map(it => ({
                id: it.itemId || it.id,
                name: it.name,
                icon: it.icon || '⚡',
                image: it.image || '',
                full: it.effect.type === 'energy_full',
                amount: it.effect.type === 'energy_full'
                    ? 0
                    : it.effect.amount * (it.quantity || 1),
                price: it.totalPrice ?? it.unitPrice ?? it.price,
                currency: it.currency || 'coins',
            }))
            .sort((a, b) => a.price - b.price);
        return _packsCache;
    },

    /** Mua một gói. Trả về true nếu thành công. */
    async buy(pack) {
        try {
            const res = await API.shop.purchase(pack.id, 1);
            const body = res?.data || res;
            if (!res?.success || body?.success === false) {
                throw new Error(body?.message || res?.error || 'Mua không thành công');
            }

            // Số dư MỚI do server chốt — client chỉ chép lại, không tự tính.
            const nb = body?.newBalance || body?.data?.newBalance;
            if (nb && GameState.state?.resources) {
                for (const k of ['coins', 'gems', 'energy', 'hints', 'shields', 'timeFreezes']) {
                    if (typeof nb[k] === 'number') GameState.state.resources[k] = nb[k];
                }
                GameState.commit();
            }

            if (GameState.state?.settings?.soundEnabled !== false) {
                Utils.playSound(Config.sounds.buyItem, 0.6, { ignoreSettings: true });
            }
            const now = GameState.getResources();
            Notification.show({
                type: 'success',
                title: 'Đã nạp năng lượng',
                message: pack.full
                    ? `Đầy bình · ${now.energy}⚡`
                    : `+${pack.amount}⚡ · còn ${now.energy}⚡`,
            });
            return true;
        } catch (err) {
            Notification.show({
                type: 'error',
                title: 'Không mua được',
                message: err.message || 'Vui lòng thử lại',
            });
            return false;
        }
    },

    /**
     * Popup hết năng lượng.
     * @param {number} needed  số ⚡ cần cho lượt chơi (để báo còn thiếu bao nhiêu)
     * @param {function} onBought  gọi lại sau khi mua xong (vd: thử vào bài lại)
     */
    async showModal({ needed = 0, onBought } = {}) {
        const packs = await this.loadPacks();
        const r = GameState.getResources();
        const coins = r.coins ?? 0;
        const fmt = (sec) => Utils.formatTime(Math.max(0, sec));

        const secondsUntilEnough = () => {
            const interval = Config.game.energyRegenInterval / GameState.energyRegenPerMinute();
            const missing = Math.max(0, (needed || r.maxEnergy) - r.energy);
            if (missing <= 0) return 0;
            const sinceLast = Date.now() - (r.lastEnergyUpdate || Date.now());
            const toNext = interval - (((sinceLast % interval) + interval) % interval);
            return Math.max(0, Math.ceil((toNext + (missing - 1) * interval) / 1000));
        };

        // Đang đầy bình thì gói "nạp đầy" là mua lấy không — server cũng chặn,
        // nhưng khoá sẵn ở đây để không ai bấm vào rồi ăn thông báo lỗi.
        const isFull = r.energy >= r.maxEnergy;

        // `icon` trong catalog có thể là emoji ('⚡') HOẶC class FontAwesome
        // ('fa-bolt'). Nối thẳng vào HTML thì loại sau in ra chữ "fa-bolt".
        // Ưu tiên ảnh vật phẩm nếu admin đã tải lên.
        const packGlyph = (p) => {
            if (p.image) return `<img src="${p.image}" alt="" class="energy-pack-img">`;
            return /^fa[srlbd]?-|^fa[srlbd]? /.test(p.icon)
                ? `<i class="fas ${p.icon}"></i>`
                : p.icon;
        };

        const packButtons = packs.length
            ? packs.map((p, i) => {
                const enough = p.currency === 'coins' ? coins >= p.price : (r.gems ?? 0) >= p.price;
                const afford = enough && !(p.full && isFull);
                const cur = p.currency === 'gems' ? '💎' : '🪙';
                const why = !enough
                    ? `Không đủ ${p.currency === 'gems' ? 'gems' : 'xu'}`
                    : (p.full && isFull ? 'Năng lượng đang đầy' : '');
                return `
                    <button class="btn ${afford ? 'btn-primary' : 'btn-secondary'} energy-pack-btn${p.full ? ' energy-pack-full' : ''}"
                        data-pack="${i}" ${afford ? '' : 'disabled'}
                        title="${why || p.name}">
                        <span>${packGlyph(p)} ${p.full ? `Nạp đầy ⚡${r.maxEnergy}` : `+${p.amount}⚡`}</span>
                        <strong>${p.price} ${cur}</strong>
                    </button>`;
            }).join('')
            : `<p class="energy-info">Cửa hàng chưa bày bán gói năng lượng nào.</p>`;

        Modal.show({
            title: 'Hết năng lượng',
            content: `
                <div class="energy-refill-modal">
                    <div class="energy-icon">⚡</div>
                    <p>Bạn còn <strong>${r.energy}⚡</strong>${needed ? ` · lượt này cần <strong>${needed}⚡</strong>` : ''}</p>
                    <p class="energy-info">Tự hồi đủ sau: <strong id="energy-countdown">${fmt(secondsUntilEnough())}</strong></p>
                    <div class="refill-options">${packButtons}</div>
                    <p class="energy-info" style="margin-top:10px">Số dư: <strong>${coins}</strong> 🪙</p>
                </div>
            `,
            onClose: () => this._stopCountdown(),
            buttons: [
                {
                    text: '🛒 Vào cửa hàng', className: 'btn-primary',
                    onClick: () => {
                        this._stopCountdown();
                        Modal.close();
                        // Điều hướng sang màn Cửa hàng (bridge React expose ở GameContext).
                        window._reactShowScreen?.('shop-screen');
                    },
                },
                { text: 'Đóng', className: 'btn-secondary', onClick: () => Modal.close() },
            ],
        });

        setTimeout(() => {
            document.querySelectorAll('.energy-pack-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const pack = packs[parseInt(btn.dataset.pack, 10)];
                    if (!pack) return;
                    btn.disabled = true;
                    const ok = await this.buy(pack);
                    if (ok) {
                        this._stopCountdown();
                        Modal.close();
                        onBought?.();
                    } else {
                        btn.disabled = false;
                    }
                });
            });

            this._stopCountdown();
            this._timer = setInterval(() => {
                const el = document.getElementById('energy-countdown');
                if (!el) return this._stopCountdown();
                const sec = secondsUntilEnough();
                el.textContent = fmt(sec);
                if (sec <= 0) this._stopCountdown();
            }, 1000);
        }, 100);
    },

    _stopCountdown() {
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }
    },
};
