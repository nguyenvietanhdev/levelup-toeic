# 📚 LevelUp TOEIC — Claude Code Instructions

Nền tảng học từ vựng và luyện thi TOEIC theo phong cách gamification: XP/level/coins/energy/streak, 12 chế độ luyện từ vựng, hệ thống thi TOEIC 7 Part, admin dashboard. Chi tiết tính năng xem `README.md` và `docs/PROJECT_DOCUMENTATION.md`.

**Stack:** Express + MongoDB (Mongoose) + JWT · React (Vite) · backend có queues/workers, tests (Jest), Docker.

## ✅ Nguyên tắc quan trọng có sẵn (giữ nguyên)

- Energy hồi 1/phút **tính server-side** (chống cheat) — mọi logic tiền tệ/XP mới cũng phải server-side
- localStorage chỉ là backup khi server không khả dụng, MongoDB là nguồn chính
- Có test Jest sẵn ở `backend/tests` — sửa logic phải chạy lại test, thêm logic phải thêm test

## 📝 Nguyên tắc code

- Không refactor lớn khi không cần — dự án đã chạy ổn, ưu tiên ổn định để demo
- Mọi thay đổi backend phải chạy `npm test` trước khi kết thúc
- Response format và convention theo code hiện có, comment tiếng Việt

## 🔒 Bối cảnh riêng

Mục tiêu cá nhân, thứ tự ưu tiên và roadmap nằm ở `.claude/ROADMAP.local.md` (bị gitignore, không lên GitHub). Đọc file đó trước khi đề xuất hướng phát triển.
