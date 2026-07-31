import AuthError from "./AuthError.jsx";

// Forgot-password (request reset OTP) view. JSX moved verbatim.
export default function ForgotPasswordForm({
    loginError,
    forgotEmail,
    setForgotEmail,
    loading,
    handleSendResetOtp,
    setAuthModal,
    setLoginError,
}) {
    return (
        <form
            id="forgot-password-form"
            className="auth-form"
            onSubmit={handleSendResetOtp}
        >
            <div className="auth-form-header">
                <div className="auth-form-icon">
                    <i className="fas fa-key"></i>
                </div>
                <h2>Quên mật khẩu</h2>
                <p className="auth-subtitle">Nhập email để nhận mã khôi phục</p>
            </div>
            <AuthError message={loginError} />
            <div className="form-group">
                <label>Email đăng ký</label>
                <div className="input-icon-wrap">
                    <i className="fas fa-envelope"></i>
                    <input
                        id="forgot-email"
                        name="forgot-email"
                        autoComplete="email"
                        type="email"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        required
                    />
                </div>
            </div>
            <button
                type="submit"
                id="send-reset-otp-btn"
                className="btn btn-primary btn-auth-submit"
                disabled={loading}
            >
                {loading ? (
                    <>
                        <i className="fas fa-spinner fa-spin"></i> Đang gửi...
                    </>
                ) : (
                    "Gửi mã OTP"
                )}
            </button>
            <p className="auth-switch">
                <button
                    type="button"
                    className="link-btn"
                    onClick={() => {
                        setAuthModal("login");
                        setLoginError("");
                    }}
                >
                    <i className="fas fa-arrow-left"></i> Quay lại đăng nhập
                </button>
            </p>
        </form>
    );
}
