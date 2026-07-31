import { getPartDirections } from './partDirections.js';

const PART_NAMES = {
    1: 'Part 1: Photographs',
    2: 'Part 2: Question-Response',
    3: 'Part 3: Conversations',
    4: 'Part 4: Talks',
    5: 'Part 5: Incomplete Sentences',
    6: 'Part 6: Text Completion',
    7: 'Part 7: Reading Comprehension',
};

export default function PartTransitionModal({ fromPart, toPart, onContinue }) {
    const isListeningToReading = fromPart === 4 && toPart === 5;
    const directions = getPartDirections(toPart);

    return (
        <div
            style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 10000,
                display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                padding: 'var(--spacing-lg)', overflowY: 'auto',
            }}
        >
            <div
                style={{
                    background: 'var(--bg-primary)', borderRadius: 'var(--border-radius-large)',
                    padding: 'var(--spacing-xl)', width: '100%', maxWidth: 640,
                    boxShadow: 'var(--shadow-xl)', margin: 'auto',
                }}
            >
                {/* Đã xong Part trước */}
                <div style={{ textAlign: 'center', marginBottom: 'var(--spacing-lg)' }}>
                    <div
                        style={{
                            width: 56, height: 56, margin: '0 auto var(--spacing-md)',
                            background: 'linear-gradient(135deg, var(--primary-color), var(--secondary-color))',
                            borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                    >
                        <i className="fas fa-check" style={{ fontSize: 26, color: 'white' }}></i>
                    </div>
                    <h2 style={{ fontSize: '1.35rem', margin: 0, color: 'var(--text-primary)' }}>
                        {isListeningToReading
                            ? 'Hoàn thành phần Listening!'
                            : `Hoàn thành ${PART_NAMES[fromPart]}!`}
                    </h2>
                    <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: 'var(--spacing-xs) 0 0' }}>
                        Tiếp theo: <strong style={{ color: 'var(--primary-color)' }}>{PART_NAMES[toPart]}</strong>
                    </p>
                </div>

                {/* Directions của Part sắp làm — dựng lại theo khung đề in */}
                {directions && (
                    <div
                        style={{
                            border: '1.5px solid var(--border-color, #d1d5db)',
                            borderRadius: 'var(--border-radius-medium)',
                            padding: 'var(--spacing-lg)', marginBottom: 'var(--spacing-lg)',
                            background: 'var(--bg-secondary)',
                        }}
                    >
                        <div
                            style={{
                                fontWeight: 700, fontSize: '1.05rem', letterSpacing: '0.02em',
                                color: 'var(--text-primary)', marginBottom: 'var(--spacing-md)',
                            }}
                        >
                            {directions.title}
                        </div>
                        <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: 1.65, color: 'var(--text-primary)' }}>
                            <strong>Directions:</strong> {directions.text}
                        </p>
                    </div>
                )}

                {isListeningToReading && (
                    <p
                        style={{
                            fontSize: '0.9rem', color: 'var(--text-secondary)', textAlign: 'center',
                            margin: '0 0 var(--spacing-lg)',
                        }}
                    >
                        <i className="fas fa-info-circle" style={{ color: 'var(--info-color)' }}></i>{' '}
                        Phần Đọc có 75 phút, đồng hồ bắt đầu chạy khi bạn vào Part 5
                    </p>
                )}

                <div style={{ display: 'flex', gap: 'var(--spacing-md)', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button
                        className="toeic-action-btn primary"
                        style={{ padding: 'var(--spacing-md) var(--spacing-xl)', fontSize: '1rem' }}
                        onClick={onContinue}
                    >
                        <i className="fas fa-arrow-right"></i> Bắt đầu Part {toPart}
                    </button>
                </div>
            </div>
        </div>
    );
}
