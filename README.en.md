# LevelUp TOEIC

A gamified TOEIC study application: 16 vocabulary practice modes, a full 7-part TOEIC test
engine, and an XP/level/energy economy — plus a browser admin panel for managing content, the
item catalog, quests, and the database.

This document explains **why the system is built the way it is**. For the feature list and setup
in Vietnamese, see [`README.md`](README.md).

| | |
|---|---|
| **Backend** | Express 4 · Mongoose 9 · MongoDB Atlas · BullMQ + Redis · JWT + Google Identity Services |
| **Frontend** | React 19 · Vite 8 · plain CSS · no router library |
| **Admin panel** | Vanilla JS, server-assembled HTML partials |
| **Scale** | 42 Mongoose models · 29 mounted API routers · 129 React component files |
| **Tests** | 464 tests across 39 Jest suites |
| **Live** | [levelup-toeic.onrender.com](https://levelup-toeic.onrender.com) — backend serves the React build from the same origin |

---

## Design decisions worth reading

Most of the interesting code here exists because something failed in a way that was hard to
see. Each section below is a real defect and the rule that replaced it.

### 1. Spending money is one atomic write, not read-check-write

The obvious way to sell an item is: read the balance, check it is enough, subtract, save. That
is what this codebase did, and it is wrong under concurrency. Two requests arriving together
both read `100`, both pass the check against a 100-coin item, both write `0` — the player gets
two items for the price of one.

`UserStats` is declared with `versionKey: false`, so Mongoose's optimistic concurrency is not
there to catch it either. The fix is to make the condition part of the write:

```js
// backend/services/balanceService.js — the "enough" test lives inside the update filter,
// so two concurrent requests cannot both pass the gate
```

`inventoryService.consume()` is the symmetric case for spending items rather than currency.
Both are single round-trips to MongoDB, which is the only place the check and the mutation can
be guaranteed to happen together.

### 2. Every unit of value is computed on the server

A study app with currency, XP, and an energy budget gives the client an incentive to lie. The
rule is absolute: the client may request, the server decides.

Energy regenerates at 1 point per minute, applied from the stored timestamp on the server
rather than counted down in the browser (`backend/utils/userStateHelper.js`). Changing the
system clock or editing localStorage produces nothing — the server recomputes from
`lastEnergyUpdate` on every read. Speed-up cards multiply only the slice of elapsed time that
actually fell inside the card's validity window, so idling ten hours with one hour of boost
remaining credits one boosted hour, not ten.

XP follows the same rule through `awardXp()`, which applies level-ups **in the same step**
rather than leaving that to the caller. This is not tidiness: level gates feature access, so a
reward path that increments `xp` without applying the level-up leaves a player who has earned a
feature locked out of it. Thresholds are `floor(100 × level^1.5)`.

### 3. CORS: an origin equal to the request's own origin is always allowed

The app was deployed, the page loaded perfectly, and login was broken.

Browsers send an `Origin` header on every method except GET and HEAD — including same-origin
requests. The backend serves the React build, so the page calls itself; but `POST /api/auth/login`
was still compared against a whitelist that defaulted to localhost, and rejected. GET requests
sent no `Origin`, so every page and every list loaded fine. Only writes died.

The rule now lives in `backend/utils/corsPolicy.js`, extracted from `server.js` specifically so
it can be tested without booting the app (`corsSelfOrigin.test.js`):

1. no `Origin` header → allow;
2. `Origin` equals the request's own origin → allow, always, whatever the domain;
3. `Origin` is in `CORS_ORIGIN` → allow (for when the frontend moves to its own host);
4. otherwise → block.

Rule 2 is the one that matters. Requiring an operator to declare their own domain in an env var
is a step that is easy to forget and fails silently when forgotten.

### 4. Security headers cannot be verified in development

`vite dev` sends no CSP and no COOP. The backend sends both. So every header-related bug in
this project has the same shape: **works perfectly on localhost, broken in production, no error
message anywhere.** It has happened three times.

- **`media-src`** — TOEIC audio lives on Cloudinary (699 URLs in `toeic_question_sets`). Without
  the directive, media falls back to `default-src 'self'` and the browser blocks every external
  audio file outright: no request, no console entry, just "cannot play audio" in the UI.
- **`frame-src`** — the Google sign-in button renders inside an iframe from
  `accounts.google.com`. Undeclared, it falls back to `'self'` and the button never appears.
- **`Cross-Origin-Opener-Policy`** — helmet defaults it to `same-origin`, which severs
  `window.opener` for popups. After choosing an account, the Google popup calls
  `opener.postMessage(credential)` to return the ID token; with a null opener it throws inside
  Google's own code, and the popup sits there blank forever. COOP is not part of CSP, so a
  perfectly complete CSP does not help. The value has to be `same-origin-allow-popups`.

The rule that came out of this: for anything header-related, **local success proves nothing** —
check the deployed response:

```bash
curl -sI https://levelup-toeic.onrender.com/ | grep -i 'content-security\|cross-origin'
```

### 5. The admin panel escapes at the point of display, because there is nowhere else

The panel builds its tables by concatenating strings into `innerHTML`. Three fields written by
users flow into it: vocabulary `source` and `contentPreview` from uploads, and `username`.

Those write paths are legitimate features with validation already in place, which means there
is no server-side fix available — the data is supposed to be storable. Escaping at render time
is the only remaining control, so `esc()` is applied at every interpolation site and pinned by
`adminEscaping.test.js`. Because the panel is classic `<script>` code with no module system,
the test loads the source and evaluates it in an isolated scope to get `esc` out.

### 6. The score predictor refuses to average incompatible numbers

The app estimates a real-exam score from practice history. Two data sources exist and they are
**not in the same unit**:

- a **full test** (200 questions) has been converted through the ETS scaling table — a real
  score out of 990;
- a **mini test** (one part) reports `readingScore` as *percent correct × 495*. Answering 15 of
  30 Part 5 questions gives "readingScore = 248", which is not a Reading score — it is 50%
  scaled up.

Averaging them produces a confident number that means nothing. Mini tests therefore contribute
only **per-part accuracy**, projected onto a full test's question counts and converted after
that (`backend/services/toeicPrediction.js`).

There is also deliberately **no "real exam penalty" constant**. Testing at home does inflate
scores — no pressure, familiar material, freedom to pause — but inventing a number to subtract
is fabricating data. The predictor returns a range with a confidence level and lets the UI
explain the caveat.

### 7. Level gating has an off switch, and it fails closed

Features unlock by level, configured per feature in the admin panel. Two escape hatches exist
and they are different on purpose:

- `User.bypassFeatureLock` — exempts **one account**, for the demo account a reviewer logs into.
- `GameConfig.featureUnlockEnabled` — a master switch that turns gating off for **everyone**.

When the master switch is off, `GET /api/features/unlocks` returns an **empty** list rather than
marking each entry unlocked. The client's `lockInfo()` treats an unknown key as unlocked, so
every padlock disappears with no frontend change at all, and the "you just unlocked X" popup
stops firing because there is genuinely nothing to unlock. The level thresholds stay in the
database untouched; switching back restores them exactly.

A missing config field or a failed config read both resolve to **enabled**. A dropped database
connection must not open every feature in the product.

### 8. Background work is queued, and the app boots without it

Email goes through BullMQ on Redis. Redis is treated as optional: it connects in the background
and is never awaited during startup, because awaiting an unavailable Redis parks the process in
a reconnect loop and `app.listen()` is never reached — turning a missing cache into a total
outage.

---

## Architecture

```
        React SPA (built by Vite, served by Express)   Vanilla-JS admin panel
                          │                                     │
                          │  fetch (bearer JWT, same origin)     │
                          ▼                                     ▼
        ┌───────────────────────────────────────────────────────────────┐
        │  Express · helmet → cors → parsers → routers → 404 → errors   │
        └───────────────────────────────────────────────────────────────┘
              │                    │                      │
         controllers          services               middleware
         (thin: req→res)    (rules, no req/res)   (auth, validate, upload)
              │                    │
              └────────┬───────────┘
                       ▼
                 Mongoose models ──▶ MongoDB Atlas
                       │
              BullMQ ──▶ Redis ──▶ worker      Cloudinary (media, disk fallback)
```

The backend serves the frontend build from the same origin. That single fact explains the CORS
rule in §3 and every header bug in §4 — it is the first thing to know about this deployment.

---

## Getting started

**Requirements:** Node.js 18+, a MongoDB instance. Redis optional.

```bash
npm run install:all
cp backend/.env.example backend/.env    # fill in MONGODB_URI and JWT_SECRET
```

Only `MONGODB_URI` and `JWT_SECRET` are required; the server exits at boot if either is missing
rather than starting with a weakened default. Google sign-in, Cloudinary, email and the AI
features each activate when their variables are present and stay dormant otherwise.

```bash
npm run dev            # backend + frontend
npm run build          # production build of the frontend
```

Create the first administrator:

```bash
cd backend
npm run create-admin
npm run change-password   # prompts; input is hidden
```

---

## Testing

```bash
cd backend && npm test    # 464 tests, 39 suites
```

The suite is deliberately **pure** — no database, no HTTP server — so it runs in seconds and can
run on every save. It covers scoring conversion, level-up arithmetic, energy regeneration,
atomic balance deduction, quest periods, shop effects, spaced repetition, catalog rules, CORS
policy, admin escaping, route guards and the auth guard.

That is also its limitation: it verifies logic, not wiring. Header behaviour, real database
interaction and deployment configuration are checked by hand against the deployed site.

---

## Known limitations

- **No integration or end-to-end tests.** Guards are unit-tested; the composed HTTP path is not.
- **Development and production share one MongoDB cluster.** Convenient, and the reason several
  admin operations are more dangerous than they look.
- **The admin panel has no module system.** Scripts are ordered by hand in one HTML file with
  manual cache-busting query strings.
- **Layering is a target, not a finished state.** Some route files still query models directly;
  `backend/CONTRIBUTING.md` scopes the convention to new and touched code.
- **`/api-docs` is currently reachable in production** because `ENABLE_API_DOCS` is set. It is
  gated by default and fails closed (`NODE_ENV === 'development'`, not `!== 'production'`) — the
  env var is a deliberate override.

---

## License

ISC
