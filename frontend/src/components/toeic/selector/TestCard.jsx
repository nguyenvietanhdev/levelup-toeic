import { useGame } from '@game/GameContext.jsx';
import { toeicEnergyCost } from '../toeicCost.js';
import { EnergyShop } from '@game/energyShop.js';

export default function TestCard({ test, onStart }) {
    const { resources } = useGame();
    const energyCost = toeicEnergyCost(test.totalQuestions);
    const notEnoughEnergy = (resources?.energy ?? 0) < energyCost;
    const coinCost = (!test.isFree && test.requiredCoins > 0) ? test.requiredCoins : 0;
    const notEnoughCoins = coinCost > 0 && (resources?.coins ?? 0) < coinCost;
    const isFullTest = test.testType === 'full-test';
    const badge = isFullTest ? 'full' : 'mini';
    const difficulty = test.difficulty || 'medium';
    const partMatch = /mini-part(\d)/.exec(test.testType || '');
    const partNum = partMatch ? partMatch[1] : null;

    return (
        <div className="toeic-test-card" data-test-id={test._id}>
            <div className="toeic-test-header">
                <div className="toeic-test-icon">
                    <i className="fas fa-file-alt"></i>
                </div>
                <div>
                    <span className={`toeic-test-badge ${badge}`}>
                        {isFullTest ? 'Full Test' : 'Mini Test'}
                    </span>
                    {partNum && <span className="toeic-test-badge part">Part {partNum}</span>}
                    <span className={`toeic-test-badge ${difficulty}`}>{difficulty}</span>
                </div>
            </div>

            <h3 className="toeic-test-title">{test.testName}</h3>
            {test.description && (
                <p className="toeic-test-description">{test.description}</p>
            )}

            <div className="toeic-test-stats">
                <div className="toeic-stat">
                    <span className="toeic-stat-value">{test.totalQuestions}</span>
                    <span className="toeic-stat-label">Câu hỏi</span>
                </div>
                <div className="toeic-stat">
                    <span className="toeic-stat-value">{Math.floor((test.totalTime || 0) / 60)}</span>
                    <span className="toeic-stat-label">Phút</span>
                </div>
                <div className="toeic-stat">
                    <span className="toeic-stat-value">{test.averageScore || '-'}</span>
                    <span className="toeic-stat-label">Trung bình</span>
                </div>
            </div>

            <div className="toeic-test-footer">
                <span className="toeic-test-attempts">
                    <i className="fas fa-users"></i> {test.timesAttempted || 0} lượt thi
                </span>
                {/* Báo giá trước khi bấm — server sẽ trừ đúng số này khi bắt đầu bài. */}
                <span
                    className="toeic-test-cost"
                    title={notEnoughEnergy ? `Cần ${energyCost} năng lượng để làm bài này` : `Bài này tốn ${energyCost} năng lượng`}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 'auto', marginRight: 10,
                        fontSize: '0.85em', fontWeight: 600,
                        color: notEnoughEnergy ? 'var(--danger, #dc2626)' : 'var(--text-secondary)',
                    }}
                >
                    <i className="fas fa-bolt"></i> {energyCost}
                </span>
                {coinCost > 0 && (
                    <span
                        title={`Bài thi này cần ${coinCost} xu để mở`}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 10,
                            fontSize: '0.85em', fontWeight: 600,
                            color: notEnoughCoins ? 'var(--danger, #dc2626)' : 'var(--text-secondary)',
                        }}
                    >
                        <i className="fas fa-coins"></i> {coinCost}
                    </span>
                )}
                <button
                    className="toeic-start-btn"
                    // Thiếu ⚡ KHÔNG khoá nút — bấm vào mở popup mua/vào cửa hàng
                    // (đỡ phải tự đi tìm cửa hàng). Chỉ khoá khi bị Level-lock hoặc
                    // thiếu xu (đề premium — xu phải cày, không mua ngay được).
                    disabled={!test.canAccess || notEnoughCoins}
                    title={notEnoughEnergy ? 'Thiếu năng lượng — bấm để nạp' : (notEnoughCoins ? 'Không đủ xu' : undefined)}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (notEnoughEnergy) { EnergyShop.showModal({ needed: energyCost }); return; }
                        onStart?.(test._id);
                    }}
                >
                    {!test.canAccess ? 'Locked' : (notEnoughEnergy ? 'Thiếu ⚡' : (notEnoughCoins ? 'Thiếu xu' : 'Bắt đầu'))}
                </button>
            </div>
        </div>
    );
}
