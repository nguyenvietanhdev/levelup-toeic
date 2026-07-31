// "Sound" panel. Presentational — state/handlers passed from SettingsScreen.
import Toggle from './Toggle.jsx';
import FlagIcon from '@ui/FlagIcon.jsx';

export default function SoundPanel({
    s,
    updateSetting,
    selectedVoiceEn,
    selectedVoiceZh,
    handleVoiceChangeEn,
    handleVoiceChangeZh,
    handleTestVoiceEn,
    handleTestVoiceZh,
    speechRate,
    handleSpeechRate,
    vocabLang,
}) {
    const isZh = vocabLang === 'zh';

    return (
        <>
            <div className="settings-section">
                <h3>Âm thanh</h3>
                <div className="setting-item">
                    <div className="setting-info"><h4>Hiệu ứng âm thanh</h4><p>Bật/tắt âm thanh khi trả lời</p></div>
                    <Toggle checked={s.soundEnabled !== false} onChange={v => updateSetting('soundEnabled', v)} />
                </div>
                <div className="setting-item">
                    <div className="setting-info"><h4>Âm nhạc luyện tập</h4><p>Nhạc nền khi luyện tập</p></div>
                    <Toggle checked={s.practiceSoundEnabled !== false} onChange={v => {
                        updateSetting('practiceSoundEnabled', v);
                        localStorage.setItem('practiceSoundEnabled', JSON.stringify(v));
                    }} />
                </div>
                <div className="setting-item">
                    <div className="setting-info"><h4>Phát âm tự động</h4><p>Tự động phát âm từ mới</p></div>
                    <Toggle checked={s.autoPronunciation === true} onChange={v => updateSetting('autoPronunciation', v)} />
                </div>
            </div>

            <div className="settings-section">
                <h3>Giọng đọc</h3>

                {/* Tiếng Anh */}
                <div className={`setting-item voice-select-row${isZh ? ' voice-select-inactive' : ''}`}
                    style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
                    <div className="setting-info">
                        <h4><FlagIcon lang="en" size={18} style={{ marginRight: 6 }} />Giọng Tiếng Anh {isZh && <span className="voice-inactive-badge">Không dùng</span>}</h4>
                        <p>Áp dụng khi đang học chế độ Tiếng Anh</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                        <select
                            value={selectedVoiceEn}
                            onChange={e => handleVoiceChangeEn(e.target.value)}
                            disabled={isZh}
                            style={{ flex: 1, opacity: isZh ? 0.45 : 1 }}
                        >
                            <optgroup label="Nữ">
                                <option value="__gtts_random__">Tự động — Random nam+nữ</option>
                                <option value="__gtts_us__">Aria — Mỹ (US) 👩</option>
                                <option value="__gtts_uk__">Sonia — Anh (UK) 👩</option>
                                <option value="__gtts_au__">Natasha — Úc (AU) 👩</option>
                                <option value="__gtts_ca__">Clara — Canada (CA) 👩</option>
                            </optgroup>
                            <optgroup label="Nam">
                                <option value="__gtts_us_m__">Guy — Mỹ (US) 👨</option>
                                <option value="__gtts_uk_m__">Ryan — Anh (UK) 👨</option>
                                <option value="__gtts_au_m__">William — Úc (AU) 👨</option>
                                <option value="__gtts_ca_m__">Liam — Canada (CA) 👨</option>
                            </optgroup>
                        </select>
                        <button className="btn btn-secondary btn-sm" onClick={handleTestVoiceEn} disabled={isZh}>
                            <i className="fas fa-volume-up"></i> Thử
                        </button>
                    </div>
                </div>

                {/* Tiếng Trung */}
                <div className={`setting-item voice-select-row${!isZh ? ' voice-select-inactive' : ''}`}
                    style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8, marginTop: 12 }}>
                    <div className="setting-info">
                        <h4><FlagIcon lang="zh" size={18} style={{ marginRight: 6 }} />Giọng Tiếng Trung {!isZh && <span className="voice-inactive-badge">Không dùng</span>}</h4>
                        <p>Áp dụng khi đang học chế độ Tiếng Trung</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                        <select
                            value={selectedVoiceZh}
                            onChange={e => handleVoiceChangeZh(e.target.value)}
                            disabled={!isZh}
                            style={{ flex: 1, opacity: !isZh ? 0.45 : 1 }}
                        >
                            <optgroup label="Nữ">
                                <option value="__gtts_zh_random__">Tự động — Random nam+nữ</option>
                                <option value="__gtts_zh_xiaoxiao__">Xiaoxiao — Tự nhiên (CN) 👩</option>
                                <option value="__gtts_zh_xiaoyi__">Xiaoyi — Trẻ (CN) 👩</option>
                                <option value="__gtts_zh_tw__">Hsiao-Chen — Đài Loan (TW) 👩</option>
                            </optgroup>
                            <optgroup label="Nam">
                                <option value="__gtts_zh_yunxi__">Yunxi — Trẻ (CN) 👨</option>
                                <option value="__gtts_zh_yunyang__">Yunyang — Trưởng thành (CN) 👨</option>
                                <option value="__gtts_zh_tw_m__">Yun Jhe — Đài Loan (TW) 👨</option>
                            </optgroup>
                        </select>
                        <button className="btn btn-secondary btn-sm" onClick={handleTestVoiceZh} disabled={!isZh}>
                            <i className="fas fa-volume-up"></i> Thử
                        </button>
                    </div>
                </div>

                <div className="setting-item" style={{ marginTop: 12 }}>
                    <div className="setting-info"><h4>Tốc độ phát âm</h4><p>{(speechRate / 100).toFixed(1)}x</p></div>
                    <input type="range" min="50" max="150" step="10" value={speechRate}
                        onChange={e => handleSpeechRate(parseInt(e.target.value))}
                        className="volume-slider" style={{ width: 140 }} />
                </div>
            </div>
        </>
    );
}
