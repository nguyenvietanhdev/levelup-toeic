import { useState, useEffect, useRef, useCallback } from 'react';
import { useGame } from '@game/GameContext.jsx';
import { useAuth } from '@components/auth/AuthContext.jsx';
import { GameState } from '@game/state.js';
import { GameLogic } from '@game/gameLogic.js';
import { API } from '@api/http.js';
import { Notification } from '@ui/Toaster.jsx';
import { Modal } from '@ui/Modal.jsx';
import { PartSelector } from '@components/vocab/part/partSelector.js';
import { ReportsAPI } from '@api/reports.js';
import { applyColorTheme, applyUiTheme, currentColorThemeKey } from '@/services/theme.js';
import { downloadBackup, pickAndRestoreBackup, resetProgress } from '@/services/backup.js';
import { resetAllSettings } from '@/services/settings.js';
import { STORAGE_KEYS, COLOR_THEME_GUEST_KEY } from '@/constants/storageKeys.js';
import GeneralPanel from './panels/GeneralPanel.jsx';
import SoundPanel from './panels/SoundPanel.jsx';
import PracticePanel from './panels/PracticePanel.jsx';
import AccountPanel from './panels/AccountPanel.jsx';
import AboutPanel from './panels/AboutPanel.jsx';
import ReportPanel from './panels/ReportPanel.jsx';
import ToeicExamPanel from './panels/ToeicExamPanel.jsx';

// Thứ tự = mức độ thường dùng, và gom theo LĨNH VỰC:
//   Chung (mục tiêu + giao diện) · Âm thanh · Luyện tập từ vựng · Thi TOEIC
//   → Tài khoản → hai mục thông tin (Về ứng dụng, Báo cáo) ở cuối.
// "Thi TOEIC" tách khỏi "Luyện tập": trước đây một tab gánh cả hai lĩnh vực,
// phình lên 12 mục và có hai mục TRÙNG TÊN "Tự động chuyển câu".
const NAV_ITEMS = [
    { key: 'general',   label: 'Chung',       icon: 'fa-sliders' },
    { key: 'sound',     label: 'Âm thanh',    icon: 'fa-volume-high' },
    { key: 'practice',  label: 'Luyện tập',   icon: 'fa-gamepad' },
    { key: 'toeic',     label: 'Thi TOEIC',   icon: 'fa-graduation-cap' },
    { key: 'account',   label: 'Tài khoản',   icon: 'fa-user' },
    { key: 'about',     label: 'Về ứng dụng', icon: 'fa-info-circle', group: 'info' },
    { key: 'report',    label: 'Báo cáo',     icon: 'fa-flag',        group: 'info' },
];


export default function SettingsScreen({ active }) {
    const { showScreen } = useGame();
    const { isLoggedIn, logout } = useAuth();
    const [activeSection, setActiveSection] = useState('general');
    const [s, setS] = useState({});

    const [voices, setVoices] = useState([]);
    // Giọng EN và ZH lưu riêng — backward compat: nếu chưa có key mới thì đọc key cũ
    const [selectedVoiceEn, setSelectedVoiceEn] = useState(() =>
        localStorage.getItem('toeic_voice_en') || localStorage.getItem('toeic_voice') || '__gtts_random__'
    );
    const [selectedVoiceZh, setSelectedVoiceZh] = useState(() =>
        localStorage.getItem('toeic_voice_zh') || '__gtts_zh_random__'
    );
    const [speechRate, setSpeechRate] = useState(() => parseInt(localStorage.getItem('toeic_speech_rate') || '80'));
    const voicesLoaded = useRef(false);

    const getColorKey = currentColorThemeKey;
    const [colorPrimary, setColorPrimary] = useState(() => {
        const saved = JSON.parse(localStorage.getItem(COLOR_THEME_GUEST_KEY) || 'null');
        return saved?.primary || '#E11D48';
    });
    const [colorSecondary, setColorSecondary] = useState(() => {
        const saved = JSON.parse(localStorage.getItem(COLOR_THEME_GUEST_KEY) || 'null');
        return saved?.secondary || '#F97316';
    });

    const [reverseMode, setReverseMode] = useState(() => localStorage.getItem('reverseMode') === 'true');

    const [cpForm, setCpForm] = useState({ current: '', newPwd: '', confirm: '' });
    const [cpError, setCpError] = useState('');
    const [showPwd, setShowPwd] = useState({ current: false, new: false, confirm: false });

    const [reportContent, setReportContent] = useState('');
    const [reportImage, setReportImage] = useState(null);
    const [reportImageName, setReportImageName] = useState('');
    const [reportSubmitting, setReportSubmitting] = useState(false);

    useEffect(() => {
        if (!active) return;
        const st = GameState.state.settings || {};
        try {
            const local = JSON.parse(localStorage.getItem('userSettings') || '{}');
            Object.assign(st, local);
        } catch {}
        setS({ ...st });
    }, [active]);

    useEffect(() => {
        if (!active || voicesLoaded.current) return;
        const load = () => {
            const list = window.speechSynthesis?.getVoices() || [];
            const en = list.filter(v => v.lang.startsWith('en'));
            if (en.length > 0) { setVoices(en); voicesLoaded.current = true; }
        };
        load();
        window.speechSynthesis?.addEventListener('voiceschanged', load);
        return () => window.speechSynthesis?.removeEventListener('voiceschanged', load);
    }, [active]);

    useEffect(() => {
        if (!active) return;
        const saved = JSON.parse(localStorage.getItem(getColorKey()) || 'null');
        if (saved) { setColorPrimary(saved.primary); setColorSecondary(saved.secondary); }
    }, [active]);

    const updateSetting = useCallback(async (key, value) => {
        setS(prev => ({ ...prev, [key]: value }));
        GameState.state.settings[key] = value;
        const critical = ['difficulty', 'levelFilter', 'questionsPerSession', 'timePerQuestion', 'questionTime', 'timeLimitEnabled', 'questionTransition', 'autoAdvance', 'toeicPerQuestionTimer', 'toeicAutoAdvance', 'toeicTransition', 'toeicCustomPartMin'];
        if (critical.includes(key)) {
            try {
                const saved = JSON.parse(localStorage.getItem('userSettings') || '{}');
                saved[key] = value;
                localStorage.setItem('userSettings', JSON.stringify(saved));
            } catch {}
        }
        await GameState.save();
    }, []);

    const handleTheme = (theme) => {
        updateSetting('theme', theme);
        applyUiTheme(theme);
        localStorage.setItem(STORAGE_KEYS.THEME, theme);
    };

    const handleColorPreset = (primary, secondary) => {
        if (!isLoggedIn) { Notification.warning('Đăng nhập để tùy chỉnh màu sắc'); return; }
        setColorPrimary(primary); setColorSecondary(secondary);
        applyColorTheme(primary, secondary);
        Notification.success('Màu sắc đã thay đổi');
    };

    const handleCustomColor = () => {
        if (!isLoggedIn) { Notification.warning('Đăng nhập để tùy chỉnh màu sắc'); return; }
        applyColorTheme(colorPrimary, colorSecondary);
        Notification.success('Màu sắc đã thay đổi');
    };

    const handleReverseMode = (val) => {
        setReverseMode(val);
        localStorage.setItem('reverseMode', val);
        Notification.success(val ? 'Chế độ VN → EN đã bật' : 'Chế độ EN → VN đã bật');
    };

    const handleVoiceChangeEn = (name) => {
        setSelectedVoiceEn(name);
        localStorage.setItem('toeic_voice_en', name);
    };

    const handleVoiceChangeZh = (name) => {
        setSelectedVoiceZh(name);
        localStorage.setItem('toeic_voice_zh', name);
    };

    const handleSpeechRate = (val) => {
        setSpeechRate(val);
        localStorage.setItem('toeic_speech_rate', String(val));
    };

    const handleTestVoiceEn = () => GameLogic.speakWord('vocabulary', 'en-US');
    const handleTestVoiceZh = () => GameLogic.speakWord('你好，我正在学习汉语。', 'zh-CN');

    const handleDifficulty = (value) => {
        const levelMap = { easy: ['A1', 'A2'], medium: ['B1', 'B2'], hard: ['C1', 'C2'], adaptive: null };
        updateSetting('difficulty', value);
        updateSetting('levelFilter', levelMap[value] ?? null);
        const qs = document.getElementById('quick-difficulty-select');
        if (qs) qs.value = value;
    };

    const handleQPS = (value) => {
        const v = value === 'auto' ? 'auto' : parseInt(value);
        updateSetting('questionsPerSession', v);
        PartSelector.updateSessionBadge?.();
        const qs = document.getElementById('quick-questions-select');
        if (qs) qs.value = value;
    };

    const handleChangePassword = async () => {
        setCpError('');
        if (!cpForm.current || !cpForm.newPwd || !cpForm.confirm) { setCpError('Vui lòng điền đầy đủ'); return; }
        if (cpForm.newPwd.length < 6) { setCpError('Mật khẩu mới phải ít nhất 6 ký tự'); return; }
        if (cpForm.newPwd !== cpForm.confirm) { setCpError('Mật khẩu không khớp'); return; }
        const res = await API.auth.changePassword({ currentPassword: cpForm.current, newPassword: cpForm.newPwd });
        if (res.success) {
            Notification.success('Đổi mật khẩu thành công!');
            setCpForm({ current: '', newPwd: '', confirm: '' });
        } else {
            setCpError(res.error || 'Đổi mật khẩu thất bại');
        }
    };

    const handleBackup = () => {
        try {
            downloadBackup();
            Notification.success('Sao lưu thành công!');
        } catch { Notification.error('Lỗi sao lưu'); }
    };

    const handleRestore = () => {
        pickAndRestoreBackup()
            .then((restored) => {
                if (!restored) return;
                Notification.success('Khôi phục thành công! Đang tải lại...');
                setTimeout(() => location.reload(), 1500);
            })
            .catch(() => Notification.error('File sao lưu không hợp lệ'));
    };

    const handleReset = () => {
        Modal.show({
            title: '⚠️ Xác nhận xóa toàn bộ tiến độ',
            content: `
                <p>Bạn có chắc chắn muốn xóa <strong>toàn bộ tiến độ</strong>?</p>
                <p style="color:var(--error-color);margin-top:10px">Hành động này <strong>không thể hoàn tác</strong>!</p>
                <ul style="margin-top:10px;padding-left:20px;color:var(--text-secondary)">
                    <li>Từ vựng đã học</li>
                    <li>Điểm số và thành tích</li>
                    <li>Coins và Gems</li>
                    <li>Streak và nhiệm vụ</li>
                </ul>`,
            buttons: [
                { text: 'Hủy', className: 'btn-secondary', onClick: () => {} },
                { text: 'Xóa tất cả', className: 'btn-danger', onClick: async () => {
                    try {
                        await resetProgress();
                        setTimeout(() => location.reload(), 500);
                    } catch (err) {
                        Notification.error(err.message || 'Xóa tiến trình thất bại');
                    }
                }},
            ],
        });
    };

    const handleResetSettings = () => {
        Modal.show({
            title: '↩️ Khôi phục cài đặt mặc định',
            content: `
                <p>Đưa <strong>toàn bộ cài đặt</strong> về mặc định: giao diện,
                màu chủ đề, âm thanh, giọng đọc, luyện tập, đảo chiều…</p>
                <p style="color:var(--text-secondary);margin-top:8px">
                Tiến độ học (từ vựng, điểm, coins) <strong>không bị ảnh hưởng</strong>.</p>`,
            buttons: [
                { text: 'Hủy', className: 'btn-secondary', onClick: () => {} },
                { text: 'Khôi phục', className: 'btn-primary', onClick: async () => {
                    await resetAllSettings();
                    Notification.success('Đã khôi phục cài đặt mặc định');
                    setTimeout(() => location.reload(), 800);
                }},
            ],
        });
    };

    const handleReportImageChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { Notification.error('Ảnh tối đa 5MB'); return; }
        setReportImage(file);
        setReportImageName(file.name);
    };

    const handleSubmitReport = async () => {
        if (reportContent.trim().length < 5) { Notification.warning('Vui lòng nhập ít nhất 5 ký tự'); return; }
        setReportSubmitting(true);
        try {
            const formData = new FormData();
            formData.append('content', reportContent.trim());
            if (reportImage) formData.append('image', reportImage);
            const data = await ReportsAPI.submit(formData);
            if (data.success) {
                Notification.success('Đã gửi báo cáo! Cảm ơn bạn.');
                setReportContent(''); setReportImage(null); setReportImageName('');
            } else {
                Notification.error(data.message || 'Gửi thất bại');
            }
        } catch { Notification.error('Lỗi kết nối'); }
        finally { setReportSubmitting(false); }
    };

    const savedColor = JSON.parse(localStorage.getItem(getColorKey()) || 'null');

    return (
        <div id="settings-screen" className={`screen ${active ? 'active' : ''}`}>
            <div className="screen-header">
                <button className="back-btn-screen icon-btn" onClick={() => showScreen('home-screen')}>
                    <i className="fas fa-arrow-left"></i>
                </button>
                <h2><i className="fas fa-cog"></i> Cài đặt</h2>
            </div>

            <div className="settings-layout">
                <nav className="settings-nav">
                    {NAV_ITEMS.map((item, i) => (
                        <button key={item.key}
                            /* Vạch ngăn trước mục 'info' đầu tiên: tách nhóm CHỈNH
                               SỬA khỏi nhóm chỉ để XEM/GỬI (Về ứng dụng, Báo cáo). */
                            className={[
                                'settings-nav-item',
                                activeSection === item.key ? 'active' : '',
                                item.group === 'info' && NAV_ITEMS[i - 1]?.group !== 'info' ? 'group-start' : '',
                            ].filter(Boolean).join(' ')}
                            onClick={() => setActiveSection(item.key)}>
                            <i className={`fas ${item.icon}`}></i> {item.label}
                        </button>
                    ))}
                    {isLoggedIn && (
                        <button className="settings-nav-item settings-nav-logout" onClick={logout}>
                            <i className="fas fa-sign-out-alt"></i> Đăng xuất
                        </button>
                    )}
                </nav>

                <div className="settings-panels">

                    <div className={`settings-panel ${activeSection === 'general' ? 'active' : ''}`}>
                        <GeneralPanel
                            s={s}
                            updateSetting={updateSetting}
                            canCustomizeColor={isLoggedIn}
                            handleTheme={handleTheme}
                            colorPrimary={colorPrimary}
                            setColorPrimary={setColorPrimary}
                            colorSecondary={colorSecondary}
                            setColorSecondary={setColorSecondary}
                            handleColorPreset={handleColorPreset}
                            handleCustomColor={handleCustomColor}
                            savedColor={savedColor}
                        />
                    </div>

                    <div className={`settings-panel ${activeSection === 'sound' ? 'active' : ''}`}>
                        <SoundPanel
                            s={s}
                            updateSetting={updateSetting}
                            selectedVoiceEn={selectedVoiceEn}
                            selectedVoiceZh={selectedVoiceZh}
                            handleVoiceChangeEn={handleVoiceChangeEn}
                            handleVoiceChangeZh={handleVoiceChangeZh}
                            voices={voices}
                            handleTestVoiceEn={handleTestVoiceEn}
                            handleTestVoiceZh={handleTestVoiceZh}
                            speechRate={speechRate}
                            handleSpeechRate={handleSpeechRate}
                            vocabLang={s.vocabLang || 'en'}
                        />
                    </div>

                    <div className={`settings-panel ${activeSection === 'practice' ? 'active' : ''}`}>
                        <PracticePanel
                            s={s}
                            handleQPS={handleQPS}
                            updateSetting={updateSetting}
                            handleDifficulty={handleDifficulty}
                            reverseMode={reverseMode}
                            handleReverseMode={handleReverseMode}
                        />
                    </div>

                    <div className={`settings-panel ${activeSection === 'toeic' ? 'active' : ''}`}>
                        <ToeicExamPanel s={s} updateSetting={updateSetting} />
                    </div>

                    <div className={`settings-panel ${activeSection === 'account' ? 'active' : ''}`}>
                        <AccountPanel
                            cpError={cpError}
                            cpForm={cpForm}
                            setCpForm={setCpForm}
                            showPwd={showPwd}
                            setShowPwd={setShowPwd}
                            handleChangePassword={handleChangePassword}
                            s={s}
                            updateSetting={updateSetting}
                            handleBackup={handleBackup}
                            handleRestore={handleRestore}
                            handleReset={handleReset}
                            handleResetSettings={handleResetSettings}
                        />
                    </div>

                    <div className={`settings-panel ${activeSection === 'about' ? 'active' : ''}`}>
                        <AboutPanel />
                    </div>

                    <div className={`settings-panel ${activeSection === 'report' ? 'active' : ''}`}>
                        <ReportPanel
                            reportContent={reportContent}
                            setReportContent={setReportContent}
                            reportImage={reportImage}
                            setReportImage={setReportImage}
                            reportImageName={reportImageName}
                            setReportImageName={setReportImageName}
                            handleReportImageChange={handleReportImageChange}
                            reportSubmitting={reportSubmitting}
                            handleSubmitReport={handleSubmitReport}
                        />
                    </div>

                </div>
            </div>
        </div>
    );
}
