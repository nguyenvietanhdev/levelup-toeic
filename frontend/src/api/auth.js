// ===================================
// AUTH API SERVICE
// ===================================
// Raw-fetch wrappers preserving the exact request/response shape the
// components already rely on (NOT the Http wrapper, which nests the body).
// Pure move out of AuthModal / AchievementsScreen.

import { authHeaders } from '@/auth/token.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const AuthAPI = {
    /** Current user (achievements live here). @returns parsed JSON, {success:false} on error. */
    async me() {
        return fetch('/api/auth/me', { headers: authHeaders() })
            .then(r => r.json())
            .catch(() => ({ success: false }));
    },

    async login(credentials) {
        return fetch('/api/auth/login', {
            method: 'POST',
            headers: JSON_HEADERS,
            body: JSON.stringify(credentials),
        }).then(r => r.json()).catch(() => ({ success: false, message: 'Lỗi kết nối' }));
    },

    /** Đăng nhập bằng Google — gửi ID token (credential) từ Google Identity Services. */
    async googleLogin(credential) {
        return fetch('/api/auth/google', {
            method: 'POST',
            headers: JSON_HEADERS,
            body: JSON.stringify({ credential }),
        }).then(r => r.json()).catch(() => ({ success: false, message: 'Lỗi kết nối' }));
    },

    /** Đăng ký trực tiếp bằng email + mật khẩu (không qua OTP). */
    async register(payload) {
        return fetch('/api/auth/register', {
            method: 'POST',
            headers: JSON_HEADERS,
            body: JSON.stringify(payload),
        }).then(r => r.json()).catch(() => ({ success: false, message: 'Lỗi kết nối' }));
    },

    async sendRegisterOtp(payload) {
        return fetch('/api/auth/send-register-otp', {
            method: 'POST',
            headers: JSON_HEADERS,
            body: JSON.stringify(payload),
        }).then(r => r.json()).catch(() => ({ success: false, message: 'Lỗi kết nối' }));
    },

    async verifyRegisterOtp(payload) {
        return fetch('/api/auth/verify-register-otp', {
            method: 'POST',
            headers: JSON_HEADERS,
            body: JSON.stringify(payload),
        }).then(r => r.json()).catch(() => ({ success: false }));
    },

    async forgotPassword(payload) {
        return fetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: JSON_HEADERS,
            body: JSON.stringify(payload),
        }).then(r => r.json()).catch(() => ({ success: false }));
    },

    async resetPassword(payload) {
        return fetch('/api/auth/reset-password', {
            method: 'POST',
            headers: JSON_HEADERS,
            body: JSON.stringify(payload),
        }).then(r => r.json()).catch(() => ({ success: false }));
    },
};
