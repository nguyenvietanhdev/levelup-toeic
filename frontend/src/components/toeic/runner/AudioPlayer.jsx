export default function AudioPlayer({ part, playing, onPlay }) {
    const hint = part <= 2
        ? 'Bấm để nghe câu hỏi và đáp án'
        : 'Bấm để nghe đoạn hội thoại';

    return (
        <div className="toeic-audio-player">
            <button
                id="play-audio-btn"
                className="toeic-action-btn primary"
                disabled={playing}
                onClick={onPlay}
                style={playing ? { opacity: 0.7 } : undefined}
            >
                <i className={`fas ${playing ? 'fa-volume-up' : 'fa-play'}`}></i>{' '}
                {playing ? 'Đang phát...' : 'Phát audio'}
            </button>
            <span className="toeic-audio-hint">
                <i className="fas fa-info-circle"></i> {hint}
            </span>
        </div>
    );
}
