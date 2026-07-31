import AuthError from "./AuthError.jsx";

// Login view. State/handlers live in AuthModal; JSX moved verbatim.
export default function LoginForm({
    loginError,
    loginForm,
    setLoginForm,
    showPassword,
    setShowPassword,
    loading,
    handleLogin,
    setAuthModal,
    setLoginError,
}) {
    return (
        <form id="login-form" className="auth-form" onSubmit={handleLogin}>
            <div className="auth-form-header">
                <div className="auth-form-icon">
                    <i className="fas fa-sign-in-alt"></i>
                </div>
                <h2>Đăng nhập</h2>
                <p className="auth-subtitle">Chào mừng trở lại!</p>
            </div>

            <AuthError message={loginError} />

            <div className="form-group">
                <label>Email</label>
                <div className="input-icon-wrap">
                    <i className="fas fa-envelope"></i>
                    <input
                        id="login-email"
                        name="login-email"
                        autoComplete="email"
                        type="email"
                        value={loginForm.email}
                        onChange={(e) =>
                            setLoginForm((p) => ({ ...p, email: e.target.value }))
                        }
                        required
                    />
                </div>
            </div>

            <div className="form-group">
                <div className="form-label-row">
                    <label>Mật khẩu</label>
                    <button
                        type="button"
                        className="link-btn forgot-link"
                        onClick={() => {
                            setAuthModal("forgotPassword");
                            setLoginError("");
                        }}
                    >
                        Quên mật khẩu?
                    </button>
                </div>
                <div className="input-password-wrap">
                    <i className="fas fa-lock input-icon-left"></i>
                    <input
                        type={showPassword ? "text" : "password"}
                        value={loginForm.password}
                        onChange={(e) =>
                            setLoginForm((p) => ({ ...p, password: e.target.value }))
                        }
                        required
                    />
                    <button
                        type="button"
                        className="btn-toggle-password"
                        onClick={() => setShowPassword((v) => !v)}
                    >
                        <i
                            className={`fas ${showPassword ? "fa-eye-slash" : "fa-eye"}`}
                        ></i>
                    </button>
                </div>
            </div>

            <button
                type="submit"
                className="btn btn-primary btn-auth-submit"
                disabled={loading}
            >
                {loading ? (
                    <>
                        <i className="fas fa-spinner fa-spin"></i> Đang đăng nhập...
                    </>
                ) : (
                    "Đăng nhập"
                )}
            </button>

            <p className="auth-switch">
                Chưa có tài khoản?{" "}
                <button
                    type="button"
                    className="link-btn"
                    onClick={() => {
                        setAuthModal("register");
                        setLoginError("");
                    }}
                >
                    Đăng ký ngay
                </button>
            </p>
        </form>
    );
}
