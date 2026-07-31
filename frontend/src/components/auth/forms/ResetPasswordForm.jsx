import AuthError from "./AuthError.jsx";
import OtpInputs from "./OtpInputs.jsx";

// Reset-password (OTP + new password) view. JSX moved verbatim.
export default function ResetPasswordForm({
    loginError,
    otpDigits,
    handleOtpChange,
    newPwd,
    setNewPwd,
    confirmPwd,
    setConfirmPwd,
    loading,
    handleResetPassword,
}) {
    return (
        <form
            id="reset-password-form"
            className="auth-form"
            onSubmit={handleResetPassword}
        >
            <div className="auth-form-header">
                <div className="auth-form-icon">
                    <i className="fas fa-lock"></i>
                </div>
                <h2>Đặt lại mật khẩu</h2>
                <p className="auth-subtitle">Nhập mã OTP và mật khẩu mới</p>
            </div>
            <AuthError message={loginError} />
            <OtpInputs prefix="reset-otp" otpDigits={otpDigits} onChange={handleOtpChange} />
            <div className="form-group">
                <label>Mật khẩu mới</label>
                <div className="input-password-wrap">
                    <i className="fas fa-lock input-icon-left"></i>
                    <input
                        type="password"
                        value={newPwd}
                        onChange={(e) => setNewPwd(e.target.value)}
                        required
                    />
                </div>
            </div>
            <div className="form-group">
                <label>Xác nhận mật khẩu</label>
                <div className="input-password-wrap">
                    <i className="fas fa-lock input-icon-left"></i>
                    <input
                        type="password"
                        value={confirmPwd}
                        onChange={(e) => setConfirmPwd(e.target.value)}
                        required
                    />
                </div>
            </div>
            <button
                type="submit"
                id="confirm-reset-btn"
                className="btn btn-primary btn-auth-submit"
                disabled={loading}
            >
                {loading ? (
                    <>
                        <i className="fas fa-spinner fa-spin"></i> Đang lưu...
                    </>
                ) : (
                    "Đặt lại mật khẩu"
                )}
            </button>
        </form>
    );
}
