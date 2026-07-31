import { useGame } from '@game/GameContext.jsx';
import { GameState } from '@game/state.js';
import ResultsContent from './ResultsContent.jsx';

/**
 * Trang Kết quả bài thi TOEIC (tách từ popup). Dữ liệu đặt tạm ở
 * GameState.state._toeicResult trước khi điều hướng tới đây.
 */
export default function ToeicResultScreen({ active }) {
    const { showScreen } = useGame();
    const data = GameState.state?._toeicResult;

    return (
        <div id="toeic-result-screen" className={`screen ${active ? 'active' : ''}`}>
            <div className="screen-header">
                <button className="back-btn-screen icon-btn" onClick={() => showScreen('toeic-screen')}>
                    <i className="fas fa-arrow-left"></i>
                </button>
                <h2><i className="fas fa-clipboard-check"></i> Kết quả bài thi</h2>
            </div>
            <div className="screen-content">
                {data
                    ? <ResultsContent data={data} />
                    : <p style={{ padding: 24, textAlign: 'center' }}>Không có dữ liệu kết quả. Hãy chọn một bài thi trong Lịch sử.</p>}
            </div>
        </div>
    );
}
