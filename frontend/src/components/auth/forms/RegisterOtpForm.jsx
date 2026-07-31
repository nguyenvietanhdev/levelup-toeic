import AuthError from "./AuthError.jsx";
import OtpInputs from "./OtpInputs.jsx";

// Register OTP verification view. JSX moved verbatim.
export default function RegisterOtpForm({
    loginError,
    registerForm,
    otpDigits,
    handleOtpChange,
    loading,
    handleVerifyOtp,
}) {
    return (
        <form
            id="register-otp-form"
            className="auth-form"
            onSubmit={handleVerifyOtp}
        >
            <div className="auth-form-header">
                <div className="auth-form-icon">
                    <i className="fas fa-shield-alt"></i>
                </div>
                <h2>Xác minh OTP</h2>
                <p className="auth-subtitle">
                    Nhập mã 6 số đã gửi đến <strong>{registerForm.email}</strong>
                </p>
            </div>
            <AuthError message={loginError} />
            <OtpInputs prefix="otp" otpDigits={otpDigits} onChange={handleOtpChange} />
            <button
                type="submit"
                id="confirm-register-otp-btn"
                className="btn btn-primary btn-auth-submit"
                disabled={loading}
            >
                {loading ? (
                    <>
                        <i className="fas fa-spinner fa-spin"></i> Đang xác minh...
                    </>
                ) : (
                    "Xác nhận"
                )}
            </button>
        </form>
    );
}
