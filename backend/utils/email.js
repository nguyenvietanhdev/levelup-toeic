/**
 * Kiểm tra định dạng email — MỘT quy tắc dùng chung (User, chia sẻ bộ từ).
 *
 * Bản cũ (`\w+…(\.\w{2,3})+`) chặn oan email thật: đuôi tên miền dài hơn 3 ký tự (.info, .online,
 * .email, .company) và dấu `+` (ten+abc@gmail.com) — người dùng đó không đăng ký được mà không
 * hiểu vì sao. Ở đây chỉ kiểm khung: một @, không khoảng trắng, tên miền có dấu chấm và đuôi
 * toàn chữ từ 2 ký tự. Email có thật hay không là việc của bước gửi mã xác nhận.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-zA-Z]{2,}$/;

module.exports = { EMAIL_RE };
