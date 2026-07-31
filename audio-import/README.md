# audio-import — vùng nạp audio TOEIC

Thư mục tạm để đổi tên + nạp file mp3 nghe (Part 1-4) cho từng đề.
File mp3 **không** được commit (xem `.gitignore`).

## Quy trình

1. **Copy** các file mp3 nguồn vào chính thư mục này.
   Tên nguồn dạng: `E26-T01-50-52.mp3` (E`<ver>`-T`<test>`-`<dải câu>`).

2. **Đổi tên** về đúng định dạng app + chuyển vào backend:
   ```
   node rename-audio.js
   ```
   Script sẽ **hỏi "đề số mấy?"** (nhập 1–10), xem trước danh sách rồi mới đổi.
   Kết quả: `E26-T01-50-52.mp3` → `ets26t1-50-52.mp3`, chuyển vào
   `backend/public/assets/audio/ets26t1/`.
   (Muốn bỏ qua bước hỏi: `node rename-audio.js 1`)

3. **Upload** lên Cloudinary + gán vào đề (chỉ nạp nhóm còn thiếu audio):
   ```
   cd ../backend
   node scripts/uploadMissingAudio.js ets26t1            # dry-run xem trước
   node scripts/uploadMissingAudio.js ets26t1 --apply    # ghi thật
   ```

## Lưu ý
- Trên **đĩa local**, audio và ảnh nằm 2 đường riêng (`assets/audio/…` vs
  `assets/images/…`). Chỉ **trên Cloudinary** chúng mới chung 1 folder theo đề.
- Nhóm câu đã có audio sẽ được bỏ qua khi upload (không đè).
- Sau khi upload thành công, file local trong `assets/` **tự động bị xoá**
  (Cloudinary là nguồn chính). Muốn dọn thủ công: `node scripts/pruneLocalAssets.js --apply`.
