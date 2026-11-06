import { useGame } from '@game/GameContext.jsx';
import NguPhapTra from './NguPhapTra.jsx';

/** Màn Công thức ngữ pháp ở menu. Lúc đang luyện tập thì dùng ngăn `NganNguPhap` thay vì màn này. */
export default function NguPhapScreen({ active }) {
    const { showScreen } = useGame();
    return (
        <div id="ngu-phap-screen" className={`screen ${active ? 'active' : ''}`}>
            <div className="screen-header">
                <button className="back-btn-screen icon-btn" onClick={() => showScreen('home-screen')}>
                    <i className="fas fa-arrow-left"></i>
                </button>
                <h2><i className="fas fa-spell-check"></i> Công thức ngữ pháp</h2>
            </div>
            <NguPhapTra active={active} />
        </div>
    );
}
