# Contributing — Backend Conventions

Áp dụng cho **code mới và code đụng tới khi sửa**. Không đổi ngược toàn bộ code cũ.

## Error handling (hợp đồng lỗi)

Một hợp đồng duy nhất, đi qua `middleware/errorHandler.js` (đã mount cuối
chuỗi, output chuẩn `{ success:false, message }`, ẩn stack ở production).

**Controller KHÔNG tự `res.status(5xx).json(...)` trong `catch`.** Dùng:

```js
const ApiError = require('../utils/ApiError');

exports.handler = async (req, res, next) => {   // luôn nhận `next`
  try {
    if (!req.body.email) throw ApiError.badRequest('Thiếu email'); // lỗi mong đợi
    // ...happy path...
    res.json({ success: true, data });
  } catch (err) {
    next(err);                                   // mọi lỗi → errorHandler
  }
};
```

- **Lỗi mong đợi** (validation, not-found, auth) → `throw`/`next` một
  `ApiError(msg, status)` (có sẵn `badRequest/unauthorized/forbidden/
  notFound/conflict`). errorHandler tự set status + message.
- **Lỗi bất ngờ** → cứ `next(err)` (Error thường → 500). KHÔNG nuốt rồi
  tự trả 500 — mất log tập trung + lệch shape.
- Mọi handler có `catch` phải khai báo `next` trong signature.
- Ngoại lệ tạm chấp nhận (chưa migrate): vài controller (ai/wrongWords/
  activity) còn trả 500 kèm message tuỳ biến + field `error`. Khi đụng
  tới, chuyển sang `next(ApiError(...))` (giữ message), bỏ field `error`.

## Input validation (route ghi)

Validate ở biên bằng `middleware/validate.js` (zero-dep) + schema trong
`validators/schemas.js`. Gắn TRƯỚC controller:

```js
router.post('/x', protect, validate(xSchema), controller.x);
```

Message trong schema phải **khớp y hệt** message controller đang trả →
adopt không đổi UX text. Đã áp: `shop/purchase`, `upload/vocabulary`.
Route ghi mới nên có schema; auth/saveState chưa migrate (adopt khi chạm).

## Layering (đích đến)

```
routes → controllers (mỏng: req→service→res) → services (rule, no req/res)
        → repositories (truy cập model) → models
```

Controller mới: không nhồi business logic; tách xuống `services/`.

## Naming

- Route file: `<domain>.js` (vd `upload.js`, không `uploadRoutes.js`).
- Controller: `<domain>Controller.js`, không nhét chi tiết hạ tầng vào tên.
- Script vận hành: đặt trong `scripts/`, không ở root.
- Một domain → một route file.

## Quy mô PR

Mỗi PR refactor phải tự đứng được, revert được, **không đổi happy-path**.
Backend đụng dữ liệu thật → việc chạm cụm model user / lõi chấm điểm
TOEIC phải có test + backup trước. Xem memory `project-backend-roadmap`.
