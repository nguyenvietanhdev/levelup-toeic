// "Account" panel: change password + sync/data. Presentational —
// state/handlers passed from SettingsScreen. JSX moved verbatim.
import Toggle from './Toggle.jsx';

const PASSWORD_FIELDS = [
    { key: 'current', placeholder: 'Mật khẩu hiện tại', label: 'current' },
    { key: 'newPwd', placeholder: 'Mật khẩu mới (≥ 6 ký tự)', label: 'new' },
    { key: 'confirm', placeholder: 'Xác nhận mật khẩu mới', label: 'confirm' },
];

export default function AccountPanel({
    cpError,
    cpForm,
    setCpForm,
    showPwd,
    setShowPwd,
    handleChangePassword,
    isGoogleAccount,
    hasUsablePassword,
    s,
    updateSetting,
    handleBackup,
    handleRestore,
    handleReset,
    handleResetSettings,
}) {
    return (
        <>
            <div className="settings-section">
                <h3>Đổi mật khẩu</h3>
                {/* Điều kiện là "CHƯA có mật khẩu dùng được", KHÔNG phải "là tài
                    khoản Google": người đăng ký email+mật khẩu TRƯỚC rồi mới
                    đăng nhập Google cũng có googleId, mà mật khẩu THẬT của họ
                    vẫn còn và phải đổi được như thường.

                    Hiện form cho người chưa có mật khẩu là mời họ gõ vào một ô
                    không bao giờ đúng. Nói thẳng lý do thay vì ẩn im lặng, vì ẩn
                    trơn thì lại tưởng app thiếu tính năng. */}
                {!hasUsablePassword ? (
                    <p className="settings-note">
                        <i className="fas fa-circle-info"></i>{' '}
                        {isGoogleAccount
                            ? 'Tài khoản này đăng nhập bằng Google nên chưa có mật khẩu riêng. '
                            : 'Tài khoản này chưa đặt mật khẩu. '}
                        Dùng <strong>Quên mật khẩu</strong> ở màn đăng nhập để đặt
                        mật khẩu qua email — sau đó bạn đăng nhập được bằng cả hai cách.
                    </p>
                ) : (
                <>
                {cpError && <div className="error-msg" style={{ marginBottom: 12 }}>{cpError}</div>}
                {PASSWORD_FIELDS.map(({ key, placeholder, label }) => (
                    <div key={key} style={{ position: 'relative', marginBottom: 10 }}>
                        <input
                            type={showPwd[label] ? 'text' : 'password'}
                            placeholder={placeholder}
                            value={cpForm[key]}
                            onChange={e => setCpForm(p => ({ ...p, [key]: e.target.value }))}
                            style={{ width: '100%', boxSizing: 'border-box', paddingRight: 40 }}
                            className="pv-input"
                        />
                        <button
                            onClick={() => setShowPwd(p => ({ ...p, [label]: !p[label] }))}
                            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                            <i className={`fas ${showPwd[label] ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                        </button>
                    </div>
                ))}
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleChangePassword}>
                    <i className="fas fa-save"></i> Lưu mật khẩu mới
                </button>
                </>
                )}
            </div>

            <div className="settings-section">
                <h3>Dữ liệu</h3>
                <button className="btn btn-secondary" style={{ width: '100%' }} onClick={handleResetSettings}>
                    <i className="fas fa-rotate-left"></i> Khôi phục cài đặt mặc định
                </button>
                <button className="btn btn-danger" style={{ width: '100%', marginTop: 10 }} onClick={handleReset}>
                    <i className="fas fa-trash-alt"></i> Xóa toàn bộ tiến độ
                </button>
            </div>
        </>
    );
}
