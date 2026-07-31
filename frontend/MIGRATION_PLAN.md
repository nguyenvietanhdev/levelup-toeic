# Kế hoạch chi tiết: Migrate `frontend/public/js/` → `frontend/src/`

## 1. Tình trạng hiện tại

### Đã migrate sang `src/` (ES module + `import`/`export`)
- `src/core/` — `vocabularyAPI.js`, `storage.js`, `eventBus.js`, `state.js`, `http.js`, `config.js`, `utils.js`, `serverStorage.js`
- `src/modules/topic/topicSelector.js`
- `src/modules/part/partSelector.js`

### Còn lại trong `public/js/` (vanilla JS, attach globals, load qua `<script>` tag)

| Loại | File | Phụ thuộc chính |
|---|---|---|
| Loader/bridge | `practice-loader.js`, `react-bridge.js` | window globals |
| Core (trùng lặp) | `core/vocabularyAPI.js` | (đã có bản trong `src/core/`) |
| Engine | `engine/logic.js`, `engine/gameLoop.js` | Http, VocabularyAPI, GameState |
| Energy | `modules/energy/energy.js` | GameState, Storage, Notification |
| Quest | `modules/quest/quest.js` | GameState, Storage |
| WrongWords | `modules/wrongWords/wrongWordsManager.js` | Storage, Http |
| Practice | `practiceManager.js`, `sessionService.js` + 15 modes trong `modes/` | Energy, Config, Utils, GameState, Notification, Modal, GameLogic |
| Toeic | `modules/toeic/toeicAPI.js`, `modules/toeic/toeicUI.js` | Http, Modal |

---

## 2. Nguyên tắc chuyển đổi (áp dụng cho mỗi file)

1. **Top-of-file imports** thay cho global ngầm: `import { Storage } from '../../core/storage.js'`.
2. **`export const Foo = {...}`** thay cho `const Foo = {...}` global. Tên giữ nguyên để giảm churn.
3. **Bỏ `if (typeof module !== 'undefined')`** export CommonJS dạng cũ (e.g. trong `vocabularyAPI.js` cũ).
4. **Loại global access (`window.X`, `typeof X !== 'undefined'`)** trong các module đã migrate — thay bằng `import`. (Cleanup `topicSelector.js:48`, `partSelector.js`.)
5. **UI shim (`Notification`, `Modal`)** import trực tiếp từ `components/ui/NotificationContainer.jsx` và `ModalContainer.jsx` — pattern đã có trong `topicSelector.js:4-5`.
6. **Side-effects khi import** (e.g. event listeners) phải gói trong `init()` — tránh chạy lúc module load.

---

## 3. Các phase

### Phase 0 — Audit & quyết định (không code)
- [ ] Diff `public/js/core/vocabularyAPI.js` vs `src/core/vocabularyAPI.js`: nếu giống → xoá bản public.
- [ ] Lập bảng "global X được dùng ở đâu" cho mỗi global (`GameLogic`, `Energy`, `Quest`, `WrongWordsManager`, `PracticeManager`, `SessionService`, `Config`, `Utils`, `GameState`, `Http`, `Notification`, `Modal`) → biết file nào phải sửa khi migrate global đó.
- [ ] Kiểm tra `Config`, `Utils`, `GameState`, `Http`, `Storage` trong `src/core/` đã đủ API mà legacy đang dùng chưa. Nếu thiếu, bổ sung trước khi migrate consumer.

### Phase 1 — Lớp foundation (không phụ thuộc PracticeManager)

Migrate theo thứ tự dependency:

1. **`engine/logic.js` → `src/core/gameLogic.js`** (hoặc `src/modules/practice/gameLogic.js`)
   - `import { Http } from './http.js'; import { VocabularyAPI } from './vocabularyAPI.js';`
   - `export const GameLogic = {...}`
2. **`modules/energy/energy.js` → `src/modules/energy/energy.js`**
   - import `Storage`, `GameState`, `Notification`, `Modal`.
3. **`modules/quest/quest.js` → `src/modules/quest/quest.js`**
4. **`modules/wrongWords/wrongWordsManager.js` → `src/modules/wrongWords/wrongWordsManager.js`**
5. **`engine/gameLoop.js` → `src/core/gameLoop.js`** (sau GameLogic)
6. **`modules/practice/sessionService.js` → `src/modules/practice/sessionService.js`**

Sau mỗi file: cập nhật `topicSelector.js` / `partSelector.js` thay `window.GameLogic` bằng `import { GameLogic } from ...`.

### Phase 2 — 15 practice modes

Mỗi file trong `modes/` chuyển sang `src/modules/practice/modes/<mode>.js`:

- Imports cần: `PracticeManager`, `Energy`, `Config`, `Utils`, `GameState`, `Notification`, `Modal`, `GameLogic`, `WrongWordsManager`, `SessionService` (tuỳ mode).
- Export: `export const Flashcard = {...}` v.v.
- **Lưu ý**: `PracticeManager` là circular reference — modes import `PracticeManager` và ngược lại. Giải pháp: dùng late binding (`import { PracticeManager } from '...'` được hoisted, gọi ở runtime trong method, không ở top-level).

Có thể song song hoá: 15 modes độc lập với nhau, chỉ phụ thuộc ngược lên `PracticeManager` + shared infra.

Danh sách modes:
- `contextLearning.js`, `dictation.js`, `exampleFillBlank.js`, `fillBlank.js`, `flashcard.js`,
- `listening.js`, `matching.js`, `multipleChoice.js`, `phoneticQuiz.js`, `pronunciationMode.js`,
- `reviewMistakes.js`, `sentenceBuilder.js`, `sentenceListening.js`, `speedQuiz.js`, `synonymCheck.js`, `wordTypeCheck.js`.

### Phase 3 — `PracticeManager`

- Tạo `src/modules/practice/practiceManager.js`.
- Import tất cả 15 modes ở đầu file → tạo `MODE_REGISTRY = { flashcard: Flashcard, ... }`. Đây là điểm thay thế cho `practice-loader.js` (script tag inject).

### Phase 4 — Toeic module

- `modules/toeic/toeicAPI.js` → `src/modules/toeic/toeicAPI.js`
- `modules/toeic/toeicUI.js` → `src/modules/toeic/toeicUI.js`
- Hiện chưa nằm trong `practice-loader.js` → kiểm tra ai load nó (chắc trong `index.html` hoặc 1 React component).

### Phase 5 — Wire-up & retire bridge

1. **Xoá `<script src="/js/practice-loader.js">`** trong `index.html:12`.
2. Tạo `src/modules/practice/bootstrap.js`:
   ```js
   export async function loadPracticeEngine() {
     await GameLogic.init();
     Energy.init();
     await TopicSelector.init();
     await TopicSelector.restoreLastTopic();
     await PartSelector.init();
     await WrongWordsManager.init?.();
     await Quest.init?.();
   }
   ```
   Thay vì script-tag injection, gọi `loadPracticeEngine()` trong `GameContext` (dynamic `import()` nếu muốn lazy).
3. **Retire `react-bridge.js`**:
   - `window.UI`, `window.Modal`, `window.Notification`, `window.QuestUI`, `window.setVocabularySource` chỉ tồn tại vì vanilla JS không thể `import` React. Sau khi modes là ES modules, chúng `import { Notification } from '.../NotificationContainer.jsx'` trực tiếp → bỏ shim.
   - Riêng `_reactShowScreen`, `_reactSetPracticeHeader`, …: thay bằng một `practiceUIBus` (EventBus đã có sẵn) — modes `EventBus.emit('practice:header', ...)`, React component `useEffect` subscribe.

### Phase 6 — Cleanup

- Xoá toàn bộ `frontend/public/js/`.
- Grep `window\.(GameLogic|Energy|Quest|...)` → fix các chỗ còn sót trong React components (11 files đã xác định: `TopNav.jsx`, `SideMenu.jsx`, `SettingsScreen.jsx`, `partSelector.js`, `topicSelector.js`, `StatisticsScreen.jsx`, `QuestScreen.jsx`, `AchievementsScreen.jsx`, `PracticeScreen.jsx`, `HomeScreen.jsx`, `GameContext.jsx`).
- Grep `typeof X !== 'undefined'` patterns → thay bằng import.
- Verify build: `npm run build` không cảnh báo missing module; chạy thử mỗi practice mode.

---

## 4. Rủi ro & lưu ý

- **Circular imports** giữa `PracticeManager` ↔ modes: dùng late binding (truy cập symbol ở runtime trong method body, không ở top-level destructuring).
- **Side effects khi import**: ví dụ `Energy.init()` không được gọi ở top-level của module — phải để bootstrap gọi.
- **Order matter cho `react-bridge.js`** đang load trước React, cung cấp shim. Sau khi xoá bridge, chắc chắn không component React nào còn đọc `window._react*` lúc mount đầu tiên.
- **Test golden path mỗi phase**: sau Phase 1 chạy thử flashcard; sau Phase 2 chạy 2-3 modes; Phase 3 đầy đủ; Phase 5 toàn bộ flow gồm topic selector, part selector, energy refill, quest progress, wrong words.
- **Commit từng phase** để dễ revert nếu regression.
