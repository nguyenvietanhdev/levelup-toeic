import { useState, useEffect, useCallback } from 'react';
import { useGame } from '@game/GameContext.jsx';
import { GameState } from '@game/state.js';
import { EventBus, GameEvents } from '@game/eventBus.js';
import { Utils } from '@lib/utils.js';
import { Energy } from '@game/energy.js';
import QuickSettings from './QuickSettings.jsx';

// Cấp độ → dải level thực tế dùng để LỌC từ vựng (phải khớp SettingsScreen).

// Cuộn xuống bao nhiêu mới bắt đầu giấu thanh. Dưới mốc này luôn hiện — ở đầu
// trang mà thanh chớp tắt theo từng cú lăn chuột thì rất khó chịu.
const HIDE_AFTER = 90;
// Ngưỡng chống rung: chuột lăn nhẹ hoặc màn cảm ứng nảy vài pixel không được
// tính là "đổi hướng".
const DELTA = 6;

/**
 * Ẩn khi cuộn XUỐNG, hiện lại khi cuộn LÊN — trả lại ~36px chiều cao lúc đang
 * đọc, mà muốn xem ⚡/xu thì chỉ cần lăn ngược một chút, không phải về đỉnh trang.
 */
function useHideOnScrollDown() {
    const [hidden, setHidden] = useState(false);

    useEffect(() => {
        let last = window.scrollY;
        let ticking = false;

        const update = () => {
            ticking = false;
            const y = window.scrollY;
            const diff = y - last;
            if (Math.abs(diff) < DELTA) return;   // rung lặt vặt → bỏ qua
            last = y;
            setHidden(y > HIDE_AFTER && diff > 0);
        };

        // rAF: sự kiện scroll bắn dày đặc, gom về mỗi khung hình một lần.
        const onScroll = () => {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(update);
        };

        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    return hidden;
}

function computeSessionLabel() {
    const s = GameState.state?.settings || {};
    let mode;
    if (s.randomQuestions === false) mode = 'Tuần tự';
    else if (s.selectedPart) mode = 'Ngẫu nhiên Part';
    else mode = 'Ngẫu nhiên';
    const count = s.questionsPerSession === 'auto' ? '' : `${s.questionsPerSession || 20} câu • `;
    return `${count}${mode}`;
}

export default function StatusBar() {
    const { user, resources } = useGame();
    const [sessionLabel, setSessionLabel] = useState(computeSessionLabel);
    const hidden = useHideOnScrollDown();

    const refreshSessionLabel = useCallback(() => setSessionLabel(computeSessionLabel()), []);

    useEffect(() => {
        refreshSessionLabel();
    }, [refreshSessionLabel]);

    useEffect(() => {
        const unsubs = [
            EventBus.on(GameEvents.SESSION_BADGE_UPDATED, refreshSessionLabel),
            EventBus.on(GameEvents.GAME_INITIALIZED, refreshSessionLabel),
        ];
        return () => unsubs.forEach(fn => fn());
    }, [refreshSessionLabel]);

    const energyFull = resources.energy >= resources.maxEnergy;
    const energyTitle = energyFull
        ? 'Năng lượng đã đầy'
        : `Năng lượng sẽ đầy sau ${Utils.formatTime(Energy.getSecondsUntilFull())}`;

    const level = user?.level || 1;
    const neededXp = Utils.getXpForLevel(level) || 100;
    const currentXp = Math.min(user?.xp || 0, neededXp);
    const xpPercent = Math.round((currentXp / neededXp) * 100);

    return (
        // inert khi ẩn: thanh chỉ trượt ra ngoài chứ không display:none, nên
        // không chặn thì Tab vẫn lọt vào hai ô chọn đang vô hình.
        <div
            className={`status-bar${hidden ? ' status-bar--hidden' : ''}`}
            id="status-bar"
            inert={hidden}
        >
            <div className="status-bar-left">
                {/* Always rendered so vanilla JS can show/hide via style.display */}
                <div id="part-badge" className="part-badge" style={{ display: 'none' }}>
                    <i className="fas fa-layer-group"></i>
                    <span id="part-badge-text"></span>
                    <button className="part-badge-close" id="clear-part-btn" title="Xóa Part">
                        <i className="fas fa-times"></i>
                    </button>
                </div>
                <div className="status-bar-divider"></div>
                <div className="resource energy-display" title={energyTitle}>
                    <i className="fas fa-bolt"></i>
                    <span id="energy-count">{resources.energy}</span>
                    <span className="resource-max">/{resources.maxEnergy}</span>
                </div>
                <div className="resource coins-display">
                    <i className="fas fa-coins"></i>
                    <span id="coins-count">{resources.coins}</span>
                </div>
                <div className="resource gems-display">
                    <i className="fas fa-gem"></i>
                    <span id="gems-count">{resources.gems}</span>
                </div>
            </div>

            <div className="status-bar-center">
                <div className="xp-bar-mini">
                    <div id="xp-progress" className="xp-progress" style={{ width: `${xpPercent}%` }}></div>
                </div>
                <span className="xp-text-mini">
                    <span id="current-xp">{currentXp}</span>/
                    <span id="needed-xp">{neededXp}</span> XP
                </span>
            </div>

            <div className="status-bar-right">
                <QuickSettings />
            </div>
        </div>
    );
}
