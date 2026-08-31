// "Sound" panel. Presentational — state/handlers passed from SettingsScreen.
import Toggle from './Toggle.jsx';
import FlagIcon from '@ui/FlagIcon.jsx';

// Thụt lề + vạch trái cho cài đặt PHỤ THUỘC một toggle phía trên (cùng quy ước
// với ToeicExamPanel).
const NESTED = { paddingLeft: 14, borderLeft: '2px solid var(--border-color)' };

export default function SoundPanel({
    s,
    updateSetting,
    selectedVoiceEn,
    selectedVoiceZh,
    selectedVoiceVi,
    handleVoiceChangeEn,
    handleVoiceChangeZh,
    handleVoiceChangeVi,
    handleTestVoiceEn,
    handleTestVoiceZh,
    handleTestVoiceVi,
    speechRate,
    handleSpeechRate,
    vocabLang,
}) {
    // Kho song ngữ dùng CẢ HAI giọng: một bản ghi có chữ Hán lẫn chữ Latin, và
    // giọng được chọn theo TỪNG văn bản chứ không theo cả kho. Nên ở `bi` thì
    // không ô nào bị khoá.
    const laSongNgu = vocabLang === 'bi';
    const isZh = vocabLang === 'zh';
    // "Không dùng" chỉ đúng khi kho kia THẬT SỰ không phát giọng này.
    const tatEn = isZh;
    const tatZh = !isZh && !laSongNgu;
    // Giọng Việt KHÔNG có ô "Không dùng" nào cả — và đó không phải sơ suất.
    //
    // Hai giọng trên gắn với KHO ĐANG HỌC: học bộ tiếng Trung thì giọng Anh
    // không phát chữ nào. Tiếng Việt thì khác hẳn — nó là mặt NGHĨA của cả ba
    // kho, nên phát ở mọi chế độ: đảo chiều (mặt hỏi là nghĩa), nút loa trên ô
    // nghĩa, popup Dịch nhanh. Không có kho nào làm nó im.

    return (
        <>
            {/* Bốn mục, KHÔNG gộp thành một "Hiệu ứng âm thanh" chung chung.
                Tên cũ nói "âm thanh khi trả lời" nhưng thực ra nó tắt cả tiếng
                bấm nút, tiếng mở rương, tiếng vòng quay… — người dùng tắt vì
                khó chịu tiếng click thì mất luôn phản hồi đúng/sai, thứ họ vẫn
                muốn giữ.
                Thực tế trong code đã có SẴN hai công tắc riêng (`soundEnabled`
                tổng và `soundEffects` cho âm giao diện, xem uiSounds.js), chỉ
                là màn Cài đặt chưa bao giờ lộ cái thứ hai ra. */}
            <div className="settings-section">
                <h3>Âm thanh</h3>
                <div className="setting-item">
                    <div className="setting-info">
                        <h4>Âm thanh</h4>
                        <p>Công tắc tổng — tắt là im hết mọi âm trong ứng dụng</p>
                    </div>
                    <Toggle checked={s.soundEnabled !== false} onChange={v => updateSetting('soundEnabled', v)} />
                </div>

                {/* Ba mục dưới phụ thuộc công tắc tổng: tắt tổng thì chúng vô
                    nghĩa, hiện ra chỉ khiến người dùng chỉnh mà không thấy gì
                    đổi. Thụt lề + vạch trái để thấy rõ quan hệ phụ thuộc. */}
                {s.soundEnabled !== false && (
                    <>
                        <div className="setting-item" style={NESTED}>
                            <div className="setting-info">
                                <h4>Âm phản hồi đúng / sai</h4>
                                <p>Tiếng báo khi trả lời đúng hoặc sai lúc luyện tập</p>
                            </div>
                            <Toggle
                                checked={s.answerFeedbackSound !== false}
                                onChange={v => updateSetting('answerFeedbackSound', v)}
                            />
                        </div>

                        <div className="setting-item" style={NESTED}>
                            <div className="setting-info">
                                <h4>Âm thao tác giao diện</h4>
                                <p>Tiếng bấm nút, mở rương, vòng quay…</p>
                            </div>
                            <Toggle
                                checked={s.soundEffects !== false}
                                onChange={v => updateSetting('soundEffects', v)}
                            />
                        </div>

                        <div className="setting-item" style={NESTED}>
                            <div className="setting-info">
                                <h4>Nhạc nền luyện tập</h4>
                                <p>Nhạc chạy suốt trong lúc luyện tập</p>
                            </div>
                            <Toggle checked={s.practiceSoundEnabled !== false} onChange={v => {
                                updateSetting('practiceSoundEnabled', v);
                                localStorage.setItem('practiceSoundEnabled', JSON.stringify(v));
                            }} />
                        </div>
                    </>
                )}

                <div className="setting-item">
                    <div className="setting-info"><h4>Phát âm tự động</h4><p>Tự động phát âm từ mới</p></div>
                    <Toggle checked={s.autoPronunciation === true} onChange={v => updateSetting('autoPronunciation', v)} />
                </div>
            </div>

            <div className="settings-section">
                <h3>Giọng đọc</h3>

                {/* Tiếng Anh */}
                <div className={`setting-item voice-select-row${tatEn ? ' voice-select-inactive' : ''}`}
                    style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
                    <div className="setting-info">
                        <h4><FlagIcon lang="en" size={18} style={{ marginRight: 6 }} />Giọng Tiếng Anh {tatEn && <span className="voice-inactive-badge">Không dùng</span>}</h4>
                        <p>Áp dụng khi đang học chế độ Tiếng Anh</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                        <select
                            value={selectedVoiceEn}
                            onChange={e => handleVoiceChangeEn(e.target.value)}
                            disabled={tatEn}
                            style={{ flex: 1, opacity: tatEn ? 0.45 : 1 }}
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
                        <button className="btn btn-secondary btn-sm" onClick={handleTestVoiceEn} disabled={tatEn}>
                            <i className="fas fa-volume-up"></i> Thử
                        </button>
                    </div>
                </div>

                {/* Tiếng Trung */}
                <div className={`setting-item voice-select-row${tatZh ? ' voice-select-inactive' : ''}`}
                    style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8, marginTop: 12 }}>
                    <div className="setting-info">
                        <h4><FlagIcon lang="zh" size={18} style={{ marginRight: 6 }} />Giọng Tiếng Trung {tatZh && <span className="voice-inactive-badge">Không dùng</span>}</h4>
                        <p>Áp dụng khi đang học chế độ Tiếng Trung</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                        <select
                            value={selectedVoiceZh}
                            onChange={e => handleVoiceChangeZh(e.target.value)}
                            disabled={tatZh}
                            style={{ flex: 1, opacity: tatZh ? 0.45 : 1 }}
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
                        <button className="btn btn-secondary btn-sm" onClick={handleTestVoiceZh} disabled={tatZh}>
                            <i className="fas fa-volume-up"></i> Thử
                        </button>
                    </div>
                </div>

                {/* Tiếng Việt — KHÔNG bao giờ khoá. Xem ghi chú ở đầu file:
                    đây là mặt nghĩa của cả ba kho, không kho nào làm nó im. */}
                <div className="setting-item voice-select-row"
                    style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8, marginTop: 12 }}>
                    <div className="setting-info">
                        <h4><FlagIcon lang="vi" size={18} style={{ marginRight: 6 }} />Giọng Tiếng Việt</h4>
                        <p>Đọc phần nghĩa — dùng ở mọi chế độ, kể cả khi đảo chiều</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                        <select
                            value={selectedVoiceVi}
                            onChange={e => handleVoiceChangeVi(e.target.value)}
                            style={{ flex: 1 }}
                        >
                            <optgroup label="Giọng Việt bản địa">
                                <option value="__gtts_vi_random__">Tự động — Random nam+nữ</option>
                                <option value="__gtts_vi__">Hoài My 👩</option>
                                <option value="__gtts_vi_m__">Nam Minh 👨</option>
                            </optgroup>
                            {/* Edge TTS chỉ có ĐÚNG hai giọng `vi-VN`. Bốn giọng
                                dưới là giọng đa ngôn ngữ đọc được tiếng Việt —
                                đo độ dài audio thì chúng trôi chảy ngang giọng
                                bản địa, nhưng chất giọng thì phải nghe mới biết
                                hợp tai hay không. Nên tách nhóm và nói rõ. */}
                            <optgroup label="Đa ngôn ngữ — nghe thử trước">
                                <option value="__gtts_vi_emma__">Emma 👩</option>
                                <option value="__gtts_vi_seraphina__">Seraphina 👩</option>
                                <option value="__gtts_vi_andrew__">Andrew 👨</option>
                                <option value="__gtts_vi_brian__">Brian 👨</option>
                            </optgroup>
                        </select>
                        <button className="btn btn-secondary btn-sm" onClick={handleTestVoiceVi}>
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
