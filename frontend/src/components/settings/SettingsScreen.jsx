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
import { levelsFor } from '@lib/levelBands.js';

// Thứ tự = mức độ thường dùng, và gom theo LĨNH VỰC:
//   Chung (mục tiêu + giao diện) · Âm thanh · Luyện tập từ vựng · Thi TOEIC
//   → Tài khoản → hai mục thông tin (Về ứng dụng, Báo cáo) ở cuối.
// "Thi TOEIC" tách khỏi "Luyện tập": trước đây một tab gánh cả hai lĩnh vực,
// phình lên 12 mục và có hai mục TRÙNG TÊN "Tự động chuyển câu".
// `keywords` để tìm nhanh: người dùng gõ thứ họ MUỐN ĐỔI ("mật khẩu", "giọng
// đọc", "màu"), không gõ tên nhóm. Chỉ khớp theo nhãn thì gõ "mật khẩu" ra rỗng
// dù nó nằm ngay trong Tài khoản — và rỗng thì trông như hỏng.
const NAV_ITEMS = [
    { key: 'general',   label: 'Chung',       icon: 'fa-sliders',
      keywords: 'giao diện màu sắc chủ đề theme sáng tối mục tiêu ngôn ngữ đảo chiều' },
    { key: 'sound',     label: 'Âm thanh',    icon: 'fa-volume-high',
      keywords: 'giọng đọc tốc độ phát âm loa tiếng nói voice tts hiệu ứng nhạc nền đúng sai phản hồi bấm nút im lặng tắt tiếng' },
    { key: 'practice',  label: 'Luyện tập',   icon: 'fa-gamepad',
      keywords: 'số câu độ khó thời gian tự động chuyển câu gợi ý' },
    { key: 'toeic',     label: 'Thi TOEIC',   icon: 'fa-graduation-cap',
      keywords: 'đề thi part bấm giờ chấm điểm' },
    { key: 'account',   label: 'Tài khoản',   icon: 'fa-user',
      keywords: 'mật khẩu đổi mật khẩu sao lưu khôi phục xoá tiến trình đăng xuất backup' },
    { key: 'about',     label: 'Về ứng dụng', icon: 'fa-info-circle', group: 'info',
      keywords: 'phiên bản thông tin tác giả' },
    { key: 'report',    label: 'Báo cáo',     icon: 'fa-flag',        group: 'info',
      keywords: 'lỗi góp ý phản hồi liên hệ' },
];

/** Bỏ dấu tiếng Việt để gõ "mat khau" cũng ra "mật khẩu". */
function fold(str) {
    return String(str || '')
        .toLowerCase()
        .normalize('NFD')
        // Viết bằng escape thay vì dán ký tự dấu thật: dấu tổ hợp là ký tự
        // vô hình trong mã nguồn, sửa nhầm một cái là regex im lặng hết khớp.
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd');
}

/**
 * Mục có khớp từ khoá không. Khớp cả nhãn LẪN `keywords`, và phải khớp HẾT các
 * từ đã gõ — gõ thêm chữ mà kết quả rộng ra thì việc lọc thành vô nghĩa.
 */
function matches(item, query) {
    const q = fold(query).trim();
    if (!q) return true;
    return q.split(/\s+/).every(w =>
        fold(item.label).includes(w) || fold(item.keywords).includes(w)
    );
}


export default function SettingsScreen({ active }) {
    const { showScreen } = useGame();
    const { isLoggedIn, logout } = useAuth();
    const [activeSection, setActiveSection] = useState('general');
    const [navQuery, setNavQuery] = useState('');
    const [s, setS] = useState({});

    // Khớp theo nhãn HOẶC từ khoá, đều bỏ dấu — người dùng gõ thứ họ muốn đổi
    // ("mật khẩu"), không gõ tên nhóm ("Tài khoản").
    const matchesQuery = (item) => matches(item, navQuery);
    const visibleCount = NAV_ITEMS.filter(matchesQuery).length;

    // Gõ tìm mà mục đang mở bị lọc mất thì màn hình chỉ còn các dòng đóng —
    // tìm được rồi vẫn phải bấm thêm một lần nữa. Tự mở mục khớp ĐẦU TIÊN.
    //
    // Làm ngay trong onChange chứ không qua useEffect: đây là hệ quả TRỰC TIẾP
    // của thao tác gõ, không phải đồng bộ với hệ thống bên ngoài. Đặt vào effect
    // là thêm một lượt render thừa và eslint cảnh báo cascading render.
    const handleNavQuery = (value) => {
        setNavQuery(value);
        const q = value.trim();
        if (!q) return;
        const first = NAV_ITEMS.find(it => matches(it, value));
        if (first) setActiveSection(first.key);
    };

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

        // Kéo lựa chọn GIỌNG ĐỌC từ hồ sơ trên server xuống.
        //
        // Ba giá trị này trước đây chỉ nằm ở localStorage, nên đăng nhập máy
        // khác là mất — ô chọn rơi về "Tự động — Random" dù người dùng đã chọn
        // giọng khác. Máy cũ vẫn nhớ nên rất dễ tưởng đã lưu rồi.
        //
        // Server là NGUỒN CHÍNH (đúng nguyên tắc của dự án: localStorage chỉ là
        // bản sao dự phòng). Chuỗi rỗng = chưa từng chọn → giữ giá trị đang có,
        // không ghi đè bằng rỗng.
        if (st.voiceEn) {
            setSelectedVoiceEn(st.voiceEn);
            localStorage.setItem('toeic_voice_en', st.voiceEn);
        }
        if (st.voiceZh) {
            setSelectedVoiceZh(st.voiceZh);
            localStorage.setItem('toeic_voice_zh', st.voiceZh);
        }
        if (st.speechRate) {
            setSpeechRate(st.speechRate);
            localStorage.setItem('toeic_speech_rate', String(st.speechRate));
        }
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
        updateSetting('voiceEn', name);
    };

    const handleVoiceChangeZh = (name) => {
        setSelectedVoiceZh(name);
        // Ghi CẢ HAI nơi: localStorage cho lần mở sau trên chính máy này (đọc
        // được ngay, không chờ mạng), và server để máy khác cũng thấy.
        localStorage.setItem('toeic_voice_zh', name);
        updateSetting('voiceZh', name);
    };

    const handleSpeechRate = (val) => {
        setSpeechRate(val);
        localStorage.setItem('toeic_speech_rate', String(val));
        updateSetting('speechRate', val);
    };

    const handleTestVoiceEn = () => GameLogic.speakWord('vocabulary', 'en-US');
    const handleTestVoiceZh = () => GameLogic.speakWord('你好，我正在学习汉语。', 'zh-CN');

    const handleDifficulty = (value) => {
        // Theo ĐÚNG khung của ngôn ngữ đang học: zh → HSK*, en → CEFR. Bảng
        // CEFR chép cứng như bản cũ thì học tiếng Trung chọn "Dễ" ra 0 từ.
        updateSetting('difficulty', value);
        updateSetting('levelFilter', levelsFor(value, s.vocabLang || 'en'));
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

            {/* Tìm nhanh — 7 nhóm, mỗi nhóm nhiều tuỳ chọn; nhớ cái nào nằm đâu
                là việc không ai muốn làm. Gõ vài chữ là lọc thẳng tới nhóm. */}
            <div className="settings-search">
                <i className="fas fa-search"></i>
                {/* `type="text"` chứ KHÔNG phải `search`: `search` sinh thêm nút
                    × RIÊNG của trình duyệt, nằm ngay cạnh nút × của app — bấm
                    cái này thì cái kia biến mất, nhìn như giao diện giật.

                    Chrome bỏ qua `autoComplete="off"` cho ô trông giống ô đăng
                    nhập. `name` lạ + `data-form-type="other"` + `data-1p-ignore`
                    (1Password) mới thật sự chặn được — không thì nó điền email
                    vào đây, và vì không mục cài đặt nào khớp "…@gmail.com" thì
                    cả danh sách biến mất, chỉ còn dòng "Không có mục nào khớp". */}
                <input
                    type="text"
                    id="settings-search-input"
                    name="settings-filter-query"
                    placeholder="Tìm cài đặt… (giao diện, âm thanh, mật khẩu…)"
                    value={navQuery}
                    onChange={(e) => handleNavQuery(e.target.value)}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                    data-form-type="other"
                    data-1p-ignore="true"
                    data-lpignore="true"
                />
                {/* Nút xoá LUÔN chiếm chỗ, chỉ ẩn/hiện bằng opacity. Gắn/gỡ khỏi
                    DOM (`{navQuery && …}` như bản cũ) làm ô nhập đổi bề rộng
                    ngay lúc gõ ký tự đầu và lúc xoá xong — đúng cái "giật". */}
                <button
                    className={`settings-search-clear${navQuery ? ' is-visible' : ''}`}
                    title="Xoá"
                    type="button"
                    tabIndex={navQuery ? 0 : -1}
                    aria-hidden={!navQuery}
                    onClick={() => setNavQuery('')}
                >
                    <i className="fas fa-times"></i>
                </button>
            </div>

            <div className="settings-layout">
                {/* Mỗi mục = NÚT + PANEL liền ngay dưới nó.
                    Trên máy tính CSS tách lại thành hai cột (nav trái, panel phải);
                    trên điện thoại giữ nguyên thứ tự này nên nó thành accordion —
                    bấm dòng nào thì nội dung xổ ngay dưới dòng đó, không phải cuộn
                    xuống cuối trang tìm.

                    Gộp MỘT vòng lặp thay vì hai khối rời (nav / panels): hai khối
                    rời thì nút và panel không bao giờ cạnh nhau trong DOM, mà
                    accordion thì bắt buộc phải vậy. */}
                {NAV_ITEMS.map((item, i) => {
                    if (!matchesQuery(item)) return null;
                    const open = activeSection === item.key;
                    return (
                        <div key={item.key}
                            className={[
                                'settings-item',
                                open ? 'open' : '',
                                // Vạch ngăn trước mục 'info' đầu tiên: tách nhóm CHỈNH
                                // SỬA khỏi nhóm chỉ để XEM/GỬI (Về ứng dụng, Báo cáo).
                                item.group === 'info' && NAV_ITEMS[i - 1]?.group !== 'info' ? 'group-start' : '',
                            ].filter(Boolean).join(' ')}
                        >
                            <button
                                className={`settings-nav-item${open ? ' active' : ''}`}
                                aria-expanded={open}
                                onClick={() => setActiveSection(open ? '' : item.key)}
                            >
                                <i className={`fas ${item.icon}`}></i>
                                <span className="settings-nav-label">{item.label}</span>
                                <i className="fas fa-chevron-down settings-nav-caret"></i>
                            </button>

                            <div className={`settings-panel ${open ? 'active' : ''}`}>
                                {item.key === 'general' && (
                                    <GeneralPanel
                                        s={s}
                                        updateSetting={updateSetting}
                                        reverseMode={reverseMode}
                                        handleReverseMode={handleReverseMode}
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
                                )}
                                {item.key === 'sound' && (
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
                                )}
                                {item.key === 'practice' && (
                                    <PracticePanel
                                        s={s}
                                        handleQPS={handleQPS}
                                        updateSetting={updateSetting}
                                        handleDifficulty={handleDifficulty}
                                    />
                                )}
                                {item.key === 'toeic' && <ToeicExamPanel s={s} updateSetting={updateSetting} />}
                                {item.key === 'account' && (
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
                                )}
                                {item.key === 'about' && <AboutPanel />}
                                {item.key === 'report' && (
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
                                )}
                            </div>
                        </div>
                    );
                })}

                {/* Không khớp gì thì phải NÓI — danh sách rỗng trơn khiến người
                    dùng tưởng trang hỏng chứ không nghĩ là do từ khoá. */}
                {visibleCount === 0 && (
                    <p className="settings-empty">
                        Không có mục nào khớp <strong>“{navQuery}”</strong>.{' '}
                        {/* Lối thoát một chạm. Trình duyệt có thể TỰ ĐIỀN email vào ô
                            tìm — lúc đó cả trang Cài đặt trống trơn mà người dùng
                            không hề gõ gì, nên phải có nút trả về nguyên trạng
                            ngay tại chỗ họ đang nhìn. */}
                        <button type="button" className="settings-empty-reset"
                            onClick={() => setNavQuery('')}>
                            Xoá từ khoá
                        </button>
                    </p>
                )}

                {isLoggedIn && !navQuery && (
                    <button className="settings-nav-item settings-nav-logout" onClick={logout}>
                        <i className="fas fa-sign-out-alt"></i> Đăng xuất
                    </button>
                )}
            </div>
        </div>
    );
}
