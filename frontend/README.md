# LevelUp TOEIC — Frontend

Giao diện học TOEIC gamification: 12 chế độ luyện từ vựng, thi thử 7 Part, XP/level/coins/energy/streak, shop, quest, thành tựu, bảng xếp hạng.

## Stack

- **React 19** + **Vite** — SPA, HMR
- **GameState singleton** (`src/game/state.js`) làm nguồn chân lý domain (user/resources/streak/settings/progress); React đọc qua `useGame()`. Một phần engine luyện tập cũ vẫn chạy vanilla JS ngoài React, đồng bộ qua singleton này — chi tiết quy tắc mutate/commit/save xem [CONTRIBUTING.md](CONTRIBUTING.md)
- **Vitest** + **Testing Library** — unit test
- Alias import: `@` = `src/`, cùng `@components`, `@layouts`, `@ui`, `@game`, `@api`, `@lib` (xem `vite.config.js`)

## Chạy dự án

Backend (`../backend`) phải chạy trước ở cổng 5000 — Vite dev server proxy `/api`, `/uploads`, `/tts-cache`, `/assets` sang đó.

```bash
npm install
npm run dev        # http://localhost:5173
```

## Scripts

| Lệnh | Mục đích |
|---|---|
| `npm run dev` | Dev server (port 5173, proxy API sang backend :5000) |
| `npm run build` | Build production |
| `npm run preview` | Preview bản build |
| `npm test` | Chạy test (Vitest) |
| `npm run test:watch` | Test watch mode |
| `npm run lint` | ESLint |
| `npm run format` | Prettier — ghi đè |
| `npm run format:check` | Prettier — chỉ kiểm tra |

## Quy ước code

Xem [CONTRIBUTING.md](CONTRIBUTING.md) — layering (features → services → domain/api → lib), quy tắc localStorage key, auth token helper, naming convention.

## Cấu trúc thư mục chính

```
src/
├── api/            # Mọi HTTP request đi qua đây — UI không gọi fetch trực tiếp
├── auth/           # Token helper
├── components/     # Feature UI (achievements, practice, shop, toeic, vocab, ...)
├── constants/       # Storage keys, hằng số dùng chung
├── game/           # Domain logic thuần (GameState, energy, gameLoop) — không import React
├── layouts/        # Layout khung trang, menu badges
├── lib/            # Utility, storage, logger
├── services/       # Điều phối UI ↔ domain/api
├── test/           # Test setup
└── ui/             # Component dùng chung (ErrorBoundary, ...)
```
