import { GameState } from '@game/state.js';
import { Utils } from '@lib/utils.js';
import { Config } from '@game/config.js';
import { EventBus, GameEvents } from '@game/eventBus.js';
import { Notification } from '@ui/Toaster.jsx';
import { EnergyShop } from '@game/energyShop.js';
import { logger } from '@lib/logger.js';

export const Energy = {

    init() {
        EventBus.on(GameEvents.ENERGY_CHANGED, (data) => {
            this.onEnergyChanged(data);
        });

        EventBus.on(GameEvents.ENERGY_DEPLETED, () => {
            this.onEnergyDepleted();
        });

        EventBus.on(GameEvents.ENERGY_FULL, () => {
            this.onEnergyFull();
        });
    },

    getCurrent() {
        return GameState.getResources().energy;
    },

    getMax() {
        return GameState.getResources().maxEnergy;
    },

    getPercentage() {
        const resources = GameState.getResources();
        return Utils.percentage(resources.energy, resources.maxEnergy);
    },

    hasEnough(amount) {
        if (this.isVIPActive()) {
            return true;
        }
        return this.getCurrent() >= amount;
    },

    isVIPActive() {
        const vip = GameState.state.vip;
        if (!vip || !vip.active) return false;

        if (Date.now() > vip.expiresAt) {
            GameState.state.vip.active = false;
            GameState.save();
            return false;
        }

        return true;
    },

    use(amount) {
        return GameState.useEnergy(amount);
    },

    add(amount) {
        return GameState.addEnergy(amount);
    },

    refillFull() {
        const resources = GameState.getResources();
        const needed = resources.maxEnergy - resources.energy;

        if (needed > 0) {
            this.add(needed);
            return true;
        }

        return false;
    },

    getTimeUntilNextRegen() {
        const resources = GameState.getResources();
        const now = Date.now();
        const lastUpdate = resources.lastEnergyUpdate;
        const timePassed = now - lastUpdate;
        const timeToNext = Config.game.energyRegenInterval - (timePassed % Config.game.energyRegenInterval);

        return Math.floor(timeToNext / 1000);
    },

    getTimeUntilFull() {
        const resources = GameState.getResources();

        if (resources.energy >= resources.maxEnergy) {
            return 0;
        }

        const needed = resources.maxEnergy - resources.energy;
        const minutes = needed * (Config.game.energyRegenInterval / 60000);

        return Math.floor(minutes * 60);
    },

    canPlayMode(mode) {
        const cost = Config.energyCosts[mode];

        if (!cost) {
            console.warn(`Unknown mode: ${mode}`);
            return false;
        }

        return this.hasEnough(cost);
    },

    getModeCost(mode) {
        return Config.energyCosts[mode] || 0;
    },

    onEnergyChanged(data) {
        logger.log('Energy changed:', data);
    },

    onEnergyDepleted() {
        logger.log('Energy depleted!');

        Notification.show({
            type: 'warning',
            title: 'Hết năng lượng!',
            message: 'Bạn cần mua thêm năng lượng hoặc đợi hồi phục.'
        });

        this.showRefillModal();
    },

    onEnergyFull() {
        logger.log('Energy full!');

        Notification.show({
            type: 'success',
            title: 'Năng lượng đầy!',
            message: 'Bạn đã có đủ năng lượng để chơi.'
        });
    },

    // Số giây chính xác đến khi năng lượng đầy (tính theo thời gian thực).
    getSecondsUntilFull() {
        const r = GameState.getResources();
        if (r.energy >= r.maxEnergy) return 0;
        // Thẻ tăng tốc rút ngắn khoảng cách giữa hai lần +1⚡ → đồng hồ phải
        // ngắn lại theo, không thì người chơi mua thẻ mà vẫn thấy chờ y như cũ.
        const interval = Config.game.energyRegenInterval / GameState.energyRegenPerMinute();
        const needed = r.maxEnergy - r.energy;
        const sinceLast = Date.now() - (r.lastEnergyUpdate || Date.now());
        const timeToNext = interval - (((sinceLast % interval) + interval) % interval);
        const totalMs = timeToNext + (needed - 1) * interval;
        return Math.max(0, Math.ceil(totalMs / 1000));
    },

    /**
     * Popup hết năng lượng. Uỷ quyền cho EnergyShop — mua qua server
     * (POST /shop/purchase) chứ KHÔNG tự trừ xu ở client như bản cũ:
     * server bỏ qua tiền tệ client gửi lên nên trừ ở đây là trừ hụt,
     * người chơi nhận năng lượng miễn phí.
     */
    showRefillModal(opts = {}) {
        return EnergyShop.showModal(opts);
    },

    stopRefillCountdown() {
        EnergyShop._stopCountdown();
    },

    playSound(name, volume = 0.6) {
        if (GameState.state?.settings?.soundEnabled === false) return;
        Utils.playSound(Config.sounds[name], volume);
    }
};

