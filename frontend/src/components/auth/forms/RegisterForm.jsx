import AuthError from "./AuthError.jsx";

// Register (collect details → send OTP) view. JSX moved verbatim.
export default function RegisterForm({
    loginError,
    registerForm,
    setRegisterForm,
    loading,
    handleRegister,
    setAuthModal,
    setLoginError,
    setOtpSent,
}) {
    return (
        <form id="register-form" className="auth-form" onSubmit={handleRegister}>
            <div className="auth-form-header">
                <div className="auth-form-icon">
                    <i className="fas fa-user-plus"></i>
                </div>
                <h2>Đăng ký</h2>
            </div>

            <AuthError message={loginError} />

            <div className="form-group">
                <label>Tên người dùng</label>
                <div className="input-icon-wrap">
                    <i className="fas fa-user"></i>
                    <input
                        id="register-username"
                        name="register-username"
                        autoComplete="off"
                        type="text"
                        placeholder="3-20 ký tự, không phải email"
                        minLength={3}
                        maxLength={20}
                        value={registerForm.username}
                        onChange={(e) =>
                            setRegisterForm((p) => ({ ...p, username: e.target.value }))
                        }
                        required
                    />
                </div>
            </div>
            <div className="form-group">
                <label>Email</label>
                <div className="input-icon-wrap">
                    <i className="fas fa-envelope"></i>
                    <input
                        id="register-email"
                        name="register-email"
                        autoComplete="email"
                        type="email"
                        value={registerForm.email}
                        onChange={(e) =>
                            setRegisterForm((p) => ({ ...p, email: e.target.value }))
                        }
                        required
                    />
                </div>
            </div>
            <div className="form-group">
                <label>Mật khẩu</label>
                <div className="input-password-wrap">
                    <i className="fas fa-lock input-icon-left"></i>
                    <input
                        type="password"
                        value={registerForm.password}
                        onChange={(e) =>
                            setRegisterForm((p) => ({ ...p, password: e.target.value }))
                        }
                        required
                    />
                </div>
            </div>

            <button
                type="submit"
                className="btn btn-primary btn-auth-submit"
                disabled={loading}
            >
                {loading ? (
                    <>
                        <i className="fas fa-spinner fa-spin"></i> Đang tạo tài khoản...
                    </>
                ) : (
                    "Đăng ký"
                )}
            </button>
            <p className="auth-switch">
                Đã có tài khoản?{" "}
                <button
                    type="button"
                    className="link-btn"
                    onClick={() => {
                        setAuthModal("login");
                        setLoginError("");
                        setOtpSent(false);
                    }}
                >
                    Đăng nhập
                </button>
            </p>
        </form>
    );
}
