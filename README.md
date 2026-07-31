# LevelUp TOEIC

Ứng dụng web học từ vựng TOEIC theo phong cách gamification — kết hợp 12 chế độ luyện tập tương tác, hệ thống thi TOEIC 7 Part đầy đủ, và cơ chế XP/level/streak để duy trì động lực học tập.

---

## Tính năng chính

### Luyện tập từ vựng (12 chế độ)
| Chế độ | Mô tả |
|---|---|
| Flashcard | Lật thẻ xem nghĩa + phát âm tự động |
| Trắc nghiệm | Chọn 1 trong 4 đáp án |
| Điền vào chỗ trống | Gõ từ vào câu ví dụ |
| Nghe và chọn | Nghe âm thanh, chọn nghĩa đúng |
| Nối từ | Kéo thả ghép từ với định nghĩa |
| Tốc chiến | Trả lời nhanh trong giới hạn thời gian |
| Từ đồng nghĩa | Nhận diện synonym |
| Phân loại từ | Xác định noun/verb/adjective/adverb |
| Câu ví dụ | Điền từ vào đoạn văn có ngữ cảnh |
| Ôn sai | Spaced repetition từ đã làm sai |
| Ngữ cảnh | Học từ qua câu ví dụ thực tế |
| Nghe gõ | Nghe và gõ lại từ (luyện chính tả) |

### Hệ thống thi TOEIC
- **Full Test**: 200 câu, 120 phút — mô phỏng đúng chuẩn thi thật
- **Mini Test**: Luyện từng Part riêng (Part 1–7)
- **Fill-in-blank**: Chỉ xem keywords, tự điền
- **Kết quả chi tiết**: Điểm theo từng Part, phân tích đúng/sai
- **Lịch sử thi**: Theo dõi tiến độ qua các lần thi

### Gamification
- **XP & Level**: Nhận kinh nghiệm sau mỗi session, lên cấp từ 1–100
- **Coins & Gems**: Kiếm qua luyện tập, dùng mua items trong Shop
- **Energy**: Mỗi chế độ tốn energy, tự hồi phục 1/phút (tính server-side)
- **Streak**: Theo dõi chuỗi ngày luyện tập liên tiếp
- **Daily Quests**: 3–4 nhiệm vụ mỗi ngày, tự reset
- **Achievements**: Huy hiệu khi đạt milestones
- **Leaderboard**: Bảng xếp hạng toàn cầu (theo tuần/tháng/all-time)

### Quản lý nội dung
- **Topic Selector**: Chọn bộ từ vựng (ETS2024, ETS2026, 1000 từ cơ bản...)
- **Part Selector**: Chọn Part cụ thể trong bộ từ vựng
- **Bộ lọc độ khó**: Easy (A1-A2) / TB (B1-B2) / Khó (C1-C2) / Tất cả
- **Tự chọn số câu**: Cố định hoặc tự động theo pool khả dụng
- **Từ sai**: Tự động theo dõi, gợi ý ôn lại
- **Từ yêu thích**: Đánh dấu từ để ôn riêng
- **Tìm kiếm**: Tìm theo tiếng Anh hoặc tiếng Việt

### Tài khoản & Đồng bộ
- Đăng ký / Đăng nhập với JWT
- Đồng bộ toàn bộ tiến độ lên MongoDB
- Backup localStorage khi server không khả dụng
- Admin dashboard: quản lý users, từ vựng, đề thi

---

## Yêu cầu hệ thống

- **Node.js** >= 18.x
- **MongoDB Atlas** (hoặc MongoDB local)
- **npm** >= 9.x

---

## Cài đặt

### 1. Clone và cài dependencies

```bash
git clone <repo-url>
cd levelup-toeic
npm install
```

### 2. Tạo file `.env`

```bash
cp .env.example .env
```

Mở `.env` và điền các giá trị:

```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/
JWT_SECRET=<tạo bằng lệnh bên dưới>
OPENAI_API_KEY=<optional>
PIXABAY_API_KEY=<optional>
```

Tạo JWT_SECRET mạnh:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Chạy ứng dụng

```bash
# Development (auto-reload)
npm run dev

# Production
npm start
```

Mở trình duyệt tại: `http://localhost:5000`

---

## Cấu trúc dự án

```
backend/
├── controllers/          # Business logic cho từng API
│   ├── authController.js
│   ├── userStateController.js
│   ├── toeicController.js
│   └── vocabularyController.js
├── models/               # MongoDB Mongoose schemas
│   ├── User.js
│   ├── ToeicTest.js
│   ├── ToeicQuestion.js
│   └── ToeicAttempt.js
├── routes/               # Express route definitions
├── middleware/           # Auth, upload, error handler
├── config/               # DB, Redis, OpenAI connections
├── public/               # Frontend (Vanilla JS SPA)
│   ├── index.html
│   ├── js/
│   │   ├── core/         # state.js, config.js, utils.js, eventBus.js
│   │   ├── engine/       # logic.js, gameLoop.js
│   │   └── modules/      # practice modes, toeic, auth, settings...
│   ├── css/
│   └── data/             # Vocabulary JSON files
├── .env.example
├── server.js             # Express app entry point
└── package.json
```

---

## API chính

### Auth
| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/api/auth/register` | Đăng ký tài khoản |
| POST | `/api/auth/login` | Đăng nhập |
| GET | `/api/auth/me` | Lấy thông tin user hiện tại |

### Game State
| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/api/user/state` | Tải toàn bộ trạng thái game |
| POST | `/api/user/state` | Lưu trạng thái game |

### TOEIC
| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/api/toeic/tests` | Danh sách đề thi |
| POST | `/api/toeic/attempts/start` | Bắt đầu làm bài |
| PUT | `/api/toeic/attempts/:id/answer` | Nộp đáp án từng câu |
| PUT | `/api/toeic/attempts/:id/pause` | Tạm dừng bài thi |
| PUT | `/api/toeic/attempts/:id/resume` | Tiếp tục bài thi |
| POST | `/api/toeic/attempts/:id/submit` | Nộp bài và chấm điểm |
| GET | `/api/toeic/my-attempts/in-progress` | Bài thi đang làm dở |

### Từ sai
| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/api/wrong-words` | Danh sách từ đã sai |
| POST | `/api/wrong-words` | Thêm từ sai |
| DELETE | `/api/wrong-words/:word` | Xóa từ sai |

---

## Tài khoản mặc định

Sau khi setup, tạo tài khoản admin qua API hoặc dùng script:

```bash
node scripts/change-password.js
```

---

## Công nghệ sử dụng

**Frontend**
- Vanilla JavaScript (ES6+, Module Pattern)
- HTML5, CSS3, Web Audio API
- Text-to-Speech (MS Edge TTS, Google TTS)

**Backend**
- Node.js + Express
- MongoDB + Mongoose
- JWT Authentication
- bcryptjs (password hashing)
- express-rate-limit (bảo vệ brute force)
- helmet (HTTP security headers)
- compression (gzip)

**External APIs** (optional)
- OpenAI GPT-4o-mini (AI helper, vocabulary enrichment)
- Pixabay (ảnh từ vựng)

---

## Lưu ý bảo mật

- File `.env` **không được commit** lên git
- Rotate API keys định kỳ
- JWT_SECRET phải có độ dài tối thiểu 64 ký tự
- Rate limiting đã được áp dụng cho `/api/auth/login` (10 lần/15 phút) và `/api/auth/register` (5 lần/giờ)

---

## License

MIT
