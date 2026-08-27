import { useState, useEffect, useCallback } from 'react';
import { useGame } from '@game/GameContext.jsx';
import { GameState } from '@game/state.js';
import { EventBus, GameEvents } from '@game/eventBus.js';
import { Utils } from '@lib/utils.js';
import { Energy } from '@game/energy.js';
import QuickSettings from './QuickSettings.jsx';
import { useHideOnScrollDown } from './useHideOnScrollDown.js';
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
    const { user, resources, currentScreen } = useGame();
    const [sessionLabel, setSessionLabel] = useState(computeSessionLabel);
    // Part đang chọn — do REACT giữ, không để vanilla JS sờ vào DOM.
    //
    // Trước đây `PartSelector.updatePartBadge()` tự đặt `style.display` lên thẻ
    // này. Nhưng React render lại là ghi đè về `display:none` (giá trị trong
    // JSX), nên badge biến mất bất chợt — và lúc khởi động thì
    // `loadSelectedPart()` còn chạy TRƯỚC khi StatusBar kịp gắn vào cây, ghi
    // vào một thẻ chưa tồn tại rồi thôi.
    const [selectedPart, setSelectedPart] = useState(
        () => GameState.state?.settings?.selectedPart || null);
    const anTheoCuon = useHideOnScrollDown();

    // ẨN HẲN khi đang ở màn luyện tập.
    //
    // Thanh này là thông tin NGOÀI buổi học: XP, xu, năng lượng, streak. Giữa
    // lúc làm bài không ai đọc nó, mà nó lại chiếm nguyên một dải trên đầu —
    // cộng với thanh điều hướng và header luyện tập thành ba tầng chồng nhau,
    // đẩy câu hỏi xuống dưới mép màn hình.
    //
    // Về trang chủ thì hiện lại: ở đó XP và năng lượng mới là thứ người dùng
    // nhìn để quyết định chơi tiếp hay nghỉ.
    //
    // KHÔNG bao gồm màn thi TOEIC: bài thi chạy BÊN TRONG `toeic-screen` cùng
    // với màn chọn đề, nên `currentScreen` không phân biệt được "đang thi" với
    // "đang chọn đề" — ẩn theo nó là ẩn luôn ở chỗ người dùng cần xem năng
    // lượng để quyết định có vào thi hay không.
    const dangLuyenTap = currentScreen === 'practice-screen';

    // Hai kiểu ẩn KHÁC NHAU, không gộp làm một:
    //
    //   ẩn theo cuộn  → trượt đi nhưng GIỮ chỗ, vì lăn ngược một cái là nó về
    //                   ngay; bỏ chỗ rồi trả lại làm nội dung nhảy liên tục.
    //   ẩn khi luyện  → bỏ HẲN khỏi luồng, vì nó không quay lại cho tới khi rời
    //                   màn; giữ chỗ là để thừa một dải trống suốt buổi học.
    const hidden = anTheoCuon || dangLuyenTap;

    const refreshSessionLabel = useCallback(() => {
        setSessionLabel(computeSessionLabel());
        setSelectedPart(GameState.state?.settings?.selectedPart || null);
    }, []);

    // Nạp động: `partSelector` kéo theo cả cụm chọn đề, import thẳng ở đây là
    // buộc nó vào chunk khởi động (và dễ thành vòng import qua GameState).
    const handleClearPart = useCallback(async () => {
        const { PartSelector } = await import('@components/vocab/part/partSelector.js');
        await PartSelector.clearPart();
    }, []);

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
            className={[
                'status-bar',
                dangLuyenTap ? 'status-bar--an-han' : '',
                anTheoCuon ? 'status-bar--hidden' : '',
            ].filter(Boolean).join(' ')}
            id="status-bar"
            inert={hidden}
        >
            <div className="status-bar-left">
                {selectedPart && (
                    <div id="part-badge" className="part-badge">
                        <i className="fas fa-layer-group"></i>
                        <span id="part-badge-text">{selectedPart}</span>
                        <button
                            className="part-badge-close"
                            id="clear-part-btn"
                            title="Xóa Part"
                            onClick={handleClearPart}
                        >
                            <i className="fas fa-times"></i>
                        </button>
                    </div>
                )}
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
