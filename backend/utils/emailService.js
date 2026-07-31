const nodemailer = require('nodemailer');
const logger = require('./logger');

// ===================================
// EMAIL SERVICE
// ===================================
// Cấu hình trong .env:
//   EMAIL_USER=your_gmail@gmail.com
//   EMAIL_PASS=your_gmail_app_password  (App Password, không phải mật khẩu thường)
//   EMAIL_FROM=LevelUp TOEIC <your_gmail@gmail.com>
//
// Để lấy App Password Gmail:
//   1. Bật 2FA tại myaccount.google.com
//   2. Vào Security → App passwords → Tạo password cho "Mail"

let transporter = null;

function getTransporter() {
    if (transporter) return transporter;

    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;

    if (!user || !pass) {
        logger.warn('⚠️  Email không được cấu hình (EMAIL_USER / EMAIL_PASS). Mã OTP sẽ in ra console.');
        return null;
    }

    transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
    });

    return transporter;
}

/**
 * Gửi email OTP
 * @param {string} to - địa chỉ email nhận
 * @param {string} code - mã 6 chữ số
 * @param {'reset'|'register'} type
 */
async function sendOtpEmail(to, code, type) {
    const isReset = type === 'reset';
    const subject = isReset ? '🔐 Mã đặt lại mật khẩu LevelUp TOEIC' : '✅ Mã xác nhận đăng ký LevelUp TOEIC';
    const heading = isReset ? 'Đặt lại mật khẩu' : 'Xác nhận email đăng ký';
    const desc = isReset
        ? 'Bạn đã yêu cầu đặt lại mật khẩu. Nhập mã dưới đây để tiếp tục:'
        : 'Cảm ơn bạn đã đăng ký! Nhập mã dưới đây để xác nhận email:';

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#E11D48,#F97316);padding:32px;text-align:center;">
            <div style="font-size:40px;margin-bottom:8px;">🎮</div>
            <h1 style="color:#fff;margin:0;font-size:24px;">LevelUp TOEIC</h1>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;text-align:center;">
            <h2 style="color:#1e293b;margin:0 0 12px;">${heading}</h2>
            <p style="color:#64748b;margin:0 0 32px;font-size:15px;">${desc}</p>
            <!-- OTP Code -->
            <div style="background:#f8fafc;border:2px dashed #e2e8f0;border-radius:12px;padding:24px;margin-bottom:32px;display:inline-block;">
              <span style="font-size:40px;font-weight:900;letter-spacing:12px;color:#E11D48;font-family:monospace;">${code}</span>
            </div>
            <p style="color:#94a3b8;font-size:13px;margin:0;">Mã có hiệu lực trong <strong>15 phút</strong>.<br>Không chia sẻ mã này với bất kỳ ai.</p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:20px;text-align:center;border-top:1px solid #e2e8f0;">
            <p style="color:#94a3b8;font-size:12px;margin:0;">Nếu bạn không yêu cầu điều này, hãy bỏ qua email này.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const t = getTransporter();

    if (!t) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('Email service not configured — EMAIL_USER and EMAIL_PASS are required in production');
        }
        // Dev mode: print to console
        logger.debug(`\n${'='.repeat(50)}`);
        logger.debug(`📧  OTP EMAIL (dev mode - no SMTP configured)`);
        logger.debug(`To: ${to}  |  Type: ${type}`);
        logger.debug(`CODE: ${code}`);
        logger.debug('='.repeat(50) + '\n');
        return;
    }

    const from = process.env.EMAIL_FROM || `LevelUp TOEIC <${process.env.EMAIL_USER}>`;
    await t.sendMail({ from, to, subject, html });
    logger.debug(`📧 OTP email sent to ${to}`);
}

module.exports = { sendOtpEmail };
