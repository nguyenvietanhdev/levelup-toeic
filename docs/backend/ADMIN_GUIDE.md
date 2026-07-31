# Admin Dashboard Guide

## 🔐 Admin Login

### Default Admin Account
- **URL**: http://localhost:5000/admin/dashboard.html
- **Username**: `admin`
- **Password**: `admin123`

⚠️ **Important**: Change the default password after first login!

---

## 🔧 Quản lý Mật khẩu

### Cách 1: Đổi mật khẩu qua Command Line (Khuyên dùng)

```bash
npm run change-password
```

Script sẽ hỏi:
1. **Username** - Nhập tên user cần đổi mật khẩu
2. **New password** - Nhập mật khẩu mới (tối thiểu 6 ký tự)
3. **Confirm password** - Nhập lại để xác nhận

Ví dụ:
```
Enter username: admin
✅ User found:
   Username: admin
   Email: admin@toeicgame.com
   Role: admin

Enter new password (min 6 characters): mynewpassword123
Confirm new password: mynewpassword123

╔═══════════════════════════════════════════════════════╗
║           ✅ PASSWORD CHANGED SUCCESSFULLY            ║
╠═══════════════════════════════════════════════════════╣
║  Username: admin                                      ║
║  New password has been set                            ║
╚═══════════════════════════════════════════════════════╝
```

### Cách 2: Reset mật khẩu Admin về mặc định

Nếu bạn quên mật khẩu admin, chạy:

```bash
npm run create-admin
```

Script này sẽ reset mật khẩu admin về `admin123`.

---

## 📊 Dashboard Features

### 1. 📚 Vocabulary Management
- Xem danh sách từ vựng
- Thêm/Sửa/Xóa từ vựng
- Lọc theo Part (1-7)
- Tìm kiếm từ vựng

### 2. 👥 User Management
- Xem danh sách users
- Quản lý vai trò (user/admin)
- Kích hoạt/Vô hiệu hóa tài khoản
- Xem thống kê user

### 3. ❓ TOEIC Questions Management
- Tạo câu hỏi TOEIC theo 7 Part
- Part 1-4: Listening (có audio)
- Part 5-7: Reading
- Upload/Quản lý file audio
- Set độ khó (easy/medium/hard)

### 4. 📝 TOEIC Tests Management
- Tạo bài test TOEIC đầy đủ 7 Part
- Tự động generate test
- Quản lý danh sách tests
- Xem thống kê attempts

---

## 🛠️ Useful Commands

```bash
# Start server
npm start

# Create/Reset admin account
npm run create-admin

# Change any user's password
npm run change-password

# Seed database with sample data
npm run seed
```

---

## 🔒 Security Best Practices

1. **Đổi mật khẩu mặc định** ngay sau lần đăng nhập đầu tiên
2. **Sử dụng mật khẩu mạnh**: Tối thiểu 8 ký tự, kết hợp chữ hoa, chữ thường, số và ký tự đặc biệt
3. **Không share** thông tin đăng nhập admin
4. **Thường xuyên backup** database
5. **Đổi JWT_SECRET** trong file `.env` cho production

---

## 🚨 Troubleshooting

### Không đăng nhập được?
1. Kiểm tra username và password
2. Chạy `npm run create-admin` để reset mật khẩu
3. Kiểm tra server có đang chạy không

### Quên mật khẩu?
```bash
npm run create-admin  # Reset về admin123
# Hoặc
npm run change-password  # Đổi mật khẩu mới
```

### API không hoạt động?
1. Kiểm tra MongoDB connection trong `.env`
2. Kiểm tra JWT_SECRET đã được set chưa
3. Xem log trong terminal để debug

---

## 📝 Environment Variables

Đảm bảo file `.env` có các biến sau:

```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb+srv://...
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRE=7d
```

---

## 📞 Support

Nếu cần hỗ trợ, check:
1. Server logs trong terminal
2. Browser console (F12) để xem lỗi frontend
3. Network tab để xem API requests/responses
