# Contributing — Frontend Conventions

Áp dụng cho **code mới và code đụng tới khi sửa**. Không cần đổi ngược toàn bộ code cũ.

## Layering (luật phụ thuộc một chiều)

```
features (components/) → services → domain (game/) / api → lib
```

- **UI không gọi `fetch` trực tiếp.** Mọi HTTP đi qua `src/api/*`.
- **Domain/logic không import React.** Quy tắc nghiệp vụ thuần để test được.
- **Service** điều phối giữa UI và domain/api (vd: theme, backup, upload).

## localStorage

KHÔNG viết string literal. Import từ registry:

```js
import { STORAGE_KEYS, colorThemeKey } from '@/constants/storageKeys.js';
localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
```

Lý do: bug `practiceSound` vs `practiceSoundEnabled` đến từ key gõ tay lệch nhau.

## Auth token

Dùng helper chung, không tự parse `authToken`:

```js
import { getToken, authHeaders } from '@/auth/token.js';
fetch(url, { headers: authHeaders() });
```

## State: GameState ↔ React

`GameState.state` (singleton) là **nguồn chân lý** domain (user/resources/streak/
settings/progress…). React đọc qua `useGame()`. Quy tắc khi mutate trực tiếp:

```js
import { GameState } from '@game/state.js';
GameState.state.resources.coins = newCoins;   // 1) mutate
GameState.commit();                            // 2) báo React re-đọc
await GameState.save();                         // 3) nếu cần lưu (tùy)
```

- **KHÔNG** import/gọi `syncFromState()` rải rác trong component sau khi
  mutate — đó là nguồn của lớp bug "UI không cập nhật tới khi F5"
  (vd practiceSound, shop coins). Dùng `GameState.commit()`.
- `commit()` chỉ báo đồng bộ UI, **không** persist. `save()` mới ghi
  localStorage/server — gọi riêng khi thật sự cần lưu.
- Method có sẵn của GameState (addXp/addCoins/learnWord…) đã tự emit
  event riêng — không cần `commit()` thêm.
- Lý do không gỡ hẳn mirror: GameState còn phục vụ code vanilla ngoài
  React (engine luyện tập, gameLoop…). Xem memory `project-refactor-roadmap`.

## Naming

| Loại | Quy ước | Ví dụ |
|---|---|---|
| Folder | kebab-case | `wrong-words/` |
| React component (file + export) | PascalCase.jsx | `TopicModal.jsx` |
| Hook | useXxx.js | `useTopics.js` |
| Service / util / controller | camelCase.js, export named | `theme.js` |
| Hằng / storage key | SCREAMING_SNAKE trong registry | `STORAGE_KEYS.THEME` |

- Code & comment mới: tiếng Anh. Chuỗi hiển thị cho người dùng: giữ tiếng Việt.
- Component > ~250 dòng JSX = dấu hiệu nên tách.

## Import paths

Alias `@` = `src/`. Dùng `@/constants/...`, `@components/...`, `@game/...` thay vì `../../..`.

## Quy mô PR

Mỗi PR refactor phải **tự đứng được**: revert được, app vẫn chạy nếu dừng giữa chừng.
Di chuyển code trước, đổi hành vi sau (PR riêng).
