# Đo chất lượng chấm của AI

Bộ chấm AI (Viết, Dịch, Hội thoại) là phần khó kiểm nhất của app: không có đáp án đúng duy nhất,
và đổi hãng AI, đổi model hay sửa prompt đều có thể làm chất lượng chấm thay đổi âm thầm. Thư mục
này chứa các bộ đo chạy **bằng AI thật**, tách khỏi `npm test` (tốn tiền, kết quả dao động).

## Bộ chấm Viết — `chamViet/`

```bash
cd backend
node eval/chamViet/chay.js          # mỗi bài chấm 3 lần
node eval/chamViet/chay.js --lan 5
```

Dùng đúng hãng/model đang chọn trong admin. Kết quả chi tiết ghi vào `chamViet/ket-qua/` (không
đưa lên git); bảng tóm tắt in ra màn hình.

### Đo gì

Không có bài được giám khảo IELTS thật chấm sẵn mà được phép dùng (bài mẫu trong sách có bản
quyền), nên bộ đo kiểm ba thứ **không cần đáp án chuẩn từ bên ngoài**:

| Chỉ số | Cách đo | Đạt khi |
|---|---|---|
| Ổn định | Chấm cùng một bài nhiều lần | Band tổng lệch ≤ 0.5 |
| Thứ tự | Ba bài tự viết ở ba mức rõ rệt (yếu / trung bình / tốt) | Điểm tăng đúng thứ tự |
| Bắt lỗi | Bài tốt được cài sẵn 6 lỗi đã biết (mạo từ, thì, hoà hợp chủ–vị) | AI chỉ ra đủ |

Bài mẫu ở `chamViet/mau.js` do nhóm tự viết cho bộ đo. Phần tính chỉ số (`doLuong.js`) có test
riêng trong `tests/evalChamViet.test.js`.

### Kết quả

**2026-11-12, deepseek-chat, 3 lần mỗi bài**

| Bài | Band tổng | Chênh giữa các lần |
|---|---|---|
| Yếu | 4.5 | 0 |
| Trung bình | 6.0–6.5 | 0.5 |
| Tốt | 8.0 | 0 |
| Tốt + 6 lỗi cài sẵn | 7.5 | 0 — bắt đủ 6/6 lỗi cả 3 lần |

Thứ tự đúng. Độ lệch ±0.5 band được dùng để hiện **khoảng điểm** cho người học
(`frontend/src/lib/khoangDiem.js`) thay vì một con số band đứng một mình.

**Lỗi bộ đo tìm ra ở lần chạy đầu:** 6/12 lượt chấm thất bại ("AI trả về kết quả chấm không đọc
được"), bài yếu thất bại 3/3. Nguyên nhân: prompt không giới hạn số lỗi, bài nhiều lỗi làm câu trả
lời dùng hết 1400/1400 token và bị cắt giữa chừng thành JSON hỏng — đúng loại bài người học cần
chấm nhất. Đã sửa (tối đa 12 lỗi, trần 3000 token) và thêm test chống tái diễn
(`tests/chuaBaiDuLieu.test.js`). Sau khi sửa: 12/12 thành công.

### Khi nào chạy lại

- Đổi hãng hoặc model AI cho chấm bài trong admin.
- Sửa prompt chấm trong `services/essayGrader.js`.
- Kết quả lệch nhiều hơn ±0.5 → cập nhật `DO_LECH_BAND` trong `frontend/src/lib/khoangDiem.js`.

### Giới hạn

- Ba bài mẫu cho một đề: đủ để bắt lỗi lớn (chấm hỏng, đảo thứ tự, mất ổn định), chưa đủ để nói
  band AI khớp giám khảo thật. Muốn vậy cần bài đã được giám khảo chấm và được phép dùng.
- Chưa đo bộ chấm Dịch và Hội thoại.
