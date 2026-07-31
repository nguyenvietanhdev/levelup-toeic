/**
 * Thẻ "Nếu thi thật bây giờ" — điểm ước lượng + đối chiếu mục tiêu.
 *
 * Cố tình KHÔNG hiện một con số trần trụi: server trả về một KHOẢNG kèm mức tin
 * cậy, và giao diện phải nói rõ khoảng đó suy từ đâu. Một con số duy nhất sẽ bị
 * đọc thành lời hứa, trong khi dữ liệu chỉ đủ để nói "quanh quanh chỗ này".
 */

const CONFIDENCE = {
    cao: { label: 'Tin cậy cao', color: 'var(--success-color, #16a34a)' },
    'trung-binh': { label: 'Tin cậy trung bình', color: 'var(--warning-color, #f59e0b)' },
    thap: { label: 'Tin cậy thấp', color: 'var(--text-secondary)' },
};

export default function ScorePredictionCard({ prediction }) {
    if (!prediction) return null;

    // Chưa đủ dữ liệu → nói THIẾU CÁI GÌ, không hiện con số nào.
    if (!prediction.enough) {
        return (
            <div className="score-prediction">
                <h3><i className="fas fa-bullseye"></i> Nếu thi thật bây giờ</h3>
                <p className="score-prediction-empty">
                    <i className="fas fa-circle-info"></i>{' '}
                    {prediction.reason || 'Chưa đủ dữ liệu để ước lượng'}.
                    {' '}Làm thêm bài ở phần còn thiếu để hệ thống ước được điểm.
                </p>
                {prediction.target > 0 && (
                    <p className="score-prediction-note">
                        Mục tiêu đang đặt: <strong>{prediction.target}</strong> điểm.
                    </p>
                )}
            </div>
        );
    }

    const { predicted, listening, reading, target, gap, reachedTarget, withinReach } = prediction;
    const conf = CONFIDENCE[prediction.confidence] || CONFIDENCE.thap;
    const fromMini = prediction.basis === 'mini-test';

    return (
        <div className="score-prediction">
            <h3><i className="fas fa-bullseye"></i> Nếu thi thật bây giờ</h3>

            <div className="score-prediction-main">
                <div className="score-prediction-range">
                    <span className="spr-edge">{predicted.low}</span>
                    <span className="spr-mid">{predicted.mid}</span>
                    <span className="spr-edge">{predicted.high}</span>
                </div>
                <div className="score-prediction-caption">
                    điểm — khoảng ước lượng trên thang 990
                </div>
                <div className="score-prediction-badges">
                    <span className="spr-badge" style={{ color: conf.color, borderColor: conf.color }}>
                        <i className="fas fa-signal"></i> {conf.label}
                    </span>
                    <span className="spr-badge">
                        <i className="fas fa-flask"></i>
                        {fromMini
                            ? ` Suy từ ${prediction.attemptsUsed} bài mini`
                            : ` Từ ${prediction.attemptsUsed} đề đầy đủ`}
                    </span>
                </div>
            </div>

            {(listening != null || reading != null) && (
                <div className="score-prediction-sections">
                    {listening != null && (
                        <div><span>Nghe</span><strong>{listening}</strong><small>/ 495</small></div>
                    )}
                    {reading != null && (
                        <div><span>Đọc</span><strong>{reading}</strong><small>/ 495</small></div>
                    )}
                    {prediction.average != null && (
                        <div><span>TB thực tế</span><strong>{prediction.average}</strong><small>/ 990</small></div>
                    )}
                </div>
            )}

            {target > 0 ? (
                <div className={`score-prediction-target${reachedTarget ? ' reached' : ''}`}>
                    {reachedTarget ? (
                        <><i className="fas fa-circle-check"></i> Đã vượt mục tiêu <strong>{target}</strong> điểm.</>
                    ) : withinReach ? (
                        <><i className="fas fa-arrows-to-dot"></i> Mục tiêu <strong>{target}</strong> nằm trong tầm với —
                            còn cách <strong>{gap}</strong> điểm so với mức giữa.</>
                    ) : (
                        <><i className="fas fa-flag"></i> Còn <strong>{gap}</strong> điểm nữa để chạm mục tiêu <strong>{target}</strong>.</>
                    )}
                </div>
            ) : (
                <div className="score-prediction-target">
                    <i className="fas fa-flag"></i> Chưa đặt mục tiêu — vào <strong>Cài đặt › Luyện tập</strong> để đặt.
                </div>
            )}

            {/* Ghi rõ giới hạn của con số. Ước lượng dựa trên bài làm ở nhà, mà
                thi ở nhà thường nhẹ hơn thi thật — không giấu điều đó đi. */}
            <p className="score-prediction-note">
                <i className="fas fa-triangle-exclamation"></i> Ước lượng từ bài bạn đã làm trên hệ thống.
                Thi thật có áp lực thời gian và đề lạ nên kết quả thường thấp hơn cận trên.
                {fromMini && ' Bạn chưa làm đề đầy đủ nào — con số này suy gián tiếp từ độ chính xác từng Part nên còn thô.'}
                {prediction.missingParts?.length > 0 &&
                    ` Chưa có dữ liệu Part ${prediction.missingParts.join(', ')}.`}
            </p>
        </div>
    );
}
