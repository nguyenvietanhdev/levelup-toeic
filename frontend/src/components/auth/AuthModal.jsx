import { useState } from "react";
import { useAuth } from "@components/auth/AuthContext.jsx";
import { useGame } from "@game/GameContext.jsx";
import { Notification } from "@ui/Toaster.jsx";
import { AuthAPI } from "@api/auth.js";
import GoogleSignInButton from "./GoogleSignInButton.jsx";
import LoginForm from "./forms/LoginForm.jsx";
import RegisterForm from "./forms/RegisterForm.jsx";
import ForgotPasswordForm from "./forms/ForgotPasswordForm.jsx";
import ResetPasswordForm from "./forms/ResetPasswordForm.jsx";

export default function AuthModal() {
  const { authModal, setAuthModal, setUser } = useAuth();
  const { syncFromState } = useGame();

  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [registerForm, setRegisterForm] = useState({
    username: "",
    email: "",
    password: "",
  });
  const [forgotEmail, setForgotEmail] = useState("");
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  if (!authModal) return null;

  const close = () => {
    setAuthModal(null);
    setLoginError("");
    setLoading(false);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setLoginError("");
    const res = await AuthAPI.login(loginForm);
    setLoading(false);
    if (res.success && res.token) {
      setUser(res.user, res.token);
      syncFromState();
      close();
      Notification.success("Đăng nhập thành công!");
    } else {
      setLoginError(res.message || "Đăng nhập thất bại");
    }
  };

  const handleGoogle = async (credential) => {
    setLoading(true);
    setLoginError("");
    const res = await AuthAPI.googleLogin(credential);
    setLoading(false);
    if (res.success && res.token) {
      setUser(res.user, res.token);
      syncFromState();
      close();
      Notification.success("Đăng nhập Google thành công!");
    } else {
      setLoginError(res.message || "Đăng nhập Google thất bại");
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setLoginError("");
    const res = await AuthAPI.register(registerForm);
    setLoading(false);
    if (res.success && res.token) {
      setUser(res.user, res.token);
      syncFromState();
      close();
      Notification.success("Đăng ký thành công!");
    } else {
      setLoginError(res.message || "Đăng ký thất bại");
    }
  };

  const handleSendResetOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    const res = await AuthAPI.forgotPassword({ email: forgotEmail });
    setLoading(false);
    if (res.success) {
      setOtpSent(true);
    } else {
      setLoginError(res.message || "Không thể gửi OTP");
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (newPwd !== confirmPwd) {
      setLoginError("Mật khẩu không khớp");
      return;
    }
    const otp = otpDigits.join("");
    setLoading(true);
    const res = await AuthAPI.resetPassword({ email: forgotEmail, code: otp, newPassword: newPwd });
    setLoading(false);
    if (res.success) {
      Notification.success("Đặt lại mật khẩu thành công!");
      setAuthModal("login");
    } else {
      setLoginError(res.message || "Thất bại");
    }
  };

  const handleOtpChange = (i, val) => {
    const digits = [...otpDigits];
    digits[i] = val.slice(-1);
    setOtpDigits(digits);
    if (val && i < 5) document.getElementById(`otp-${i + 1}`)?.focus();
  };

  return (
    <div id="auth-modal" className="auth-modal active">
      <div className="auth-modal-content auth-split">
        {/* Cột trái — panel thương hiệu */}
        <div className="auth-brand-panel">
          <div className="auth-brand-logo">
            <i className="fas fa-graduation-cap"></i>
          </div>
          <h2 className="auth-brand-title">LevelUp TOEIC</h2>
          <p className="auth-brand-tagline">
            Học từ vựng &amp; luyện thi TOEIC mỗi ngày — vui như chơi game.
          </p>
          <ul className="auth-brand-features">
            <li><i className="fas fa-check-circle"></i> Bài thi 7-Part chuẩn quốc tế</li>
            <li><i className="fas fa-check-circle"></i> Học từ vựng gamhóa: streak, huy hiệu, cửa hàng</li>
            <li><i className="fas fa-check-circle"></i> Theo dõi tiến độ &amp; độ chính xác</li>
          </ul>
        </div>

        {/* Cột phải — form */}
        <div className="auth-form-panel">
          <button className="auth-close-btn" onClick={close}>
            <i className="fas fa-times"></i>
          </button>

          {authModal === "login" && (
            <>
              <LoginForm
                loginError={loginError}
                loginForm={loginForm}
                setLoginForm={setLoginForm}
                showPassword={showPassword}
                setShowPassword={setShowPassword}
                loading={loading}
                handleLogin={handleLogin}
                setAuthModal={setAuthModal}
                setLoginError={setLoginError}
              />
              <GoogleSignInButton onCredential={handleGoogle} />
            </>
          )}

          {authModal === "register" && (
            <>
              <RegisterForm
                loginError={loginError}
                registerForm={registerForm}
                setRegisterForm={setRegisterForm}
                loading={loading}
                handleRegister={handleRegister}
                setAuthModal={setAuthModal}
                setLoginError={setLoginError}
                setOtpSent={setOtpSent}
              />
              <GoogleSignInButton onCredential={handleGoogle} />
            </>
          )}

          {authModal === "forgotPassword" && !otpSent && (
            <ForgotPasswordForm
              loginError={loginError}
              forgotEmail={forgotEmail}
              setForgotEmail={setForgotEmail}
              loading={loading}
              handleSendResetOtp={handleSendResetOtp}
              setAuthModal={setAuthModal}
              setLoginError={setLoginError}
            />
          )}

          {authModal === "forgotPassword" && otpSent && (
            <ResetPasswordForm
              loginError={loginError}
              otpDigits={otpDigits}
              handleOtpChange={handleOtpChange}
              newPwd={newPwd}
              setNewPwd={setNewPwd}
              confirmPwd={confirmPwd}
              setConfirmPwd={setConfirmPwd}
              loading={loading}
              handleResetPassword={handleResetPassword}
            />
          )}
        </div>
      </div>
    </div>
  );
}
