import EmptyState from './EmptyState.jsx';
import ProgressChart from './charts/ProgressChart.jsx';
import ListeningReadingChart from './charts/ListeningReadingChart.jsx';
import PartsChart from './charts/PartsChart.jsx';
import ScorePredictionCard from './ScorePredictionCard.jsx';
import { useToeicAnalytics } from '../hooks/useToeicAnalytics.js';

const NoData = ({ icon, text }) => (
    <div
        style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: 180, color: 'var(--text-secondary)', gap: 12,
        }}
    >
        <i className={`fas ${icon}`} style={{ fontSize: '2.5rem', opacity: 0.3 }}></i>
        <p style={{ margin: 0, fontSize: '0.9em', textAlign: 'center' }}
           dangerouslySetInnerHTML={{ __html: text }}></p>
    </div>
);

const PART_NAME = { 1: 'Part 1', 2: 'Part 2', 3: 'Part 3', 4: 'Part 4', 5: 'Part 5', 6: 'Part 6', 7: 'Part 7' };

export default function AnalyticsView({ active }) {
    const { overview, progress, parts, speed, prediction, loading, error } = useToeicAnalytics({ enabled: active });

    if (loading && !overview) {
        return (
            <div style={{ textAlign: 'center', padding: 40 }}>
                <i className="fas fa-spinner fa-spin fa-2x"></i>
            </div>
        );
    }

    if (error) {
        return (
            <EmptyState
                title="Chưa có dữ liệu thống kê"
                text="Làm một vài bài thi để xem phân tích chi tiết!"
            />
        );
    }

    const totalAttempts = overview?.totalAttempts || 0;
    const hasAttempts = totalAttempts > 0;
    const hasProgress = Array.isArray(progress) && progress.length > 0;
    const hasParts = Array.isArray(parts) && parts.length > 0;

    return (
        <div className="toeic-analytics-container">
            {/* Đặt TRÊN CÙNG: đây là câu hỏi người học thật sự muốn biết ("tôi
                đang ở đâu so với mục tiêu"), các biểu đồ bên dưới là để giải
                thích vì sao ra con số đó. */}
            <ScorePredictionCard prediction={prediction} />

            <div className="analytics-overview">
                <h3><i className="fas fa-chart-bar"></i> Tổng quan</h3>
                <div className="analytics-grid">
                    <div className="analytics-card">
                        <div className="analytics-value">{totalAttempts}</div>
                        <div className="analytics-label">Lần thi</div>
                    </div>
                    <div className="analytics-card">
                        <div className="analytics-value">{overview?.averageScore || 0}</div>
                        <div className="analytics-label">Điểm TB</div>
                    </div>
                    <div className="analytics-card">
                        <div className="analytics-value">{overview?.bestScore || 0}</div>
                        <div className="analytics-label">Điểm cao nhất</div>
                    </div>
                </div>
            </div>

            <div className="analytics-charts-row">
                <div className="analytics-chart-card">
                    <h3><i className="fas fa-chart-line"></i> Tiến độ điểm số</h3>
                    {hasProgress
                        ? <ProgressChart data={progress} />
                        : <NoData icon="fa-chart-line" text="Hoàn thành bài thi để xem<br>tiến độ điểm số của bạn" />}
                </div>

                <div className="analytics-chart-card">
                    <h3><i className="fas fa-chart-pie"></i> Listening vs Reading</h3>
                    {hasAttempts
                        ? <ListeningReadingChart overview={overview} />
                        : <NoData icon="fa-chart-pie" text="Chưa có dữ liệu<br>Listening / Reading" />}
                </div>
            </div>

            <div className="analytics-chart-card full-width">
                <h3><i className="fas fa-layer-group"></i> Phân tích theo Part</h3>
                {hasParts
                    ? <PartsChart data={parts} />
                    : <NoData icon="fa-layer-group" text="Hoàn thành Mini Test theo Part<br>để xem phân tích chi tiết" />}
            </div>

            <div className="analytics-chart-card full-width">
                <h3><i className="fas fa-stopwatch"></i> Tốc độ phản hồi mỗi câu</h3>
                {speed?.hasData ? (
                    <SpeedSection speed={speed} />
                ) : (
                    <NoData icon="fa-stopwatch" text="Làm thêm vài bài (sau bản cập nhật)<br>để xem tốc độ phản hồi từng câu" />
                )}
            </div>
        </div>
    );
}

// Mục tốc độ: so giây/câu với nhịp chuẩn TOEIC theo Part + cảnh báo đoán bừa.
function SpeedSection({ speed }) {
    const { parts = [], rushWrong = 0, slowRight = 0 } = speed;
    return (
        <div className="speed-analysis">
            <div className="speed-bars">
                {parts.map(p => {
                    // Thanh dài theo giây/câu, mốc chuẩn vẽ vạch để đối chiếu.
                    const max = Math.max(p.avgSec, p.targetSec) * 1.15 || 1;
                    const overPace = p.avgSec > p.targetSec;
                    return (
                        <div key={p.partNumber} className="speed-row">
                            <span className="speed-part">{PART_NAME[p.partNumber] || `Part ${p.partNumber}`}</span>
                            <div className="speed-track">
                                <div
                                    className={`speed-fill${overPace ? ' over' : ''}`}
                                    style={{ width: `${Math.min(100, (p.avgSec / max) * 100)}%` }}
                                />
                                <div className="speed-target-mark" style={{ left: `${Math.min(100, (p.targetSec / max) * 100)}%` }}
                                     title={`Nhịp chuẩn ${p.targetSec}s/câu`} />
                            </div>
                            <span className={`speed-val${overPace ? ' over' : ''}`}>{p.avgSec}s</span>
                        </div>
                    );
                })}
            </div>
            <p className="speed-legend">
                <span className="speed-legend-item"><i className="fas fa-square" style={{ color: 'var(--primary-color)' }}></i> Tốc độ của bạn</span>
                <span className="speed-legend-item"><i className="fas fa-grip-lines-vertical"></i> Nhịp chuẩn TOEIC</span>
            </p>

            {(rushWrong > 0 || slowRight > 0) && (
                <div className="speed-flags">
                    {rushWrong > 0 && (
                        <div className="speed-flag warn">
                            <i className="fas fa-bolt"></i>
                            <span><b>{rushWrong}</b> câu trả lời dưới 3 giây nhưng SAI — coi chừng đoán bừa, đọc kỹ hơn.</span>
                        </div>
                    )}
                    {slowRight > 0 && (
                        <div className="speed-flag info">
                            <i className="fas fa-hourglass-half"></i>
                            <span><b>{slowRight}</b> câu đúng nhưng ngốn hơn gấp đôi nhịp chuẩn — luyện để nhanh hơn khi thi thật.</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
