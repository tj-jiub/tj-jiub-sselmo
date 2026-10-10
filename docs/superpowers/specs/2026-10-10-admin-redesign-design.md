# 쓸모: 숫자 티커 · 공실 대표 사진 · 관리자 개편

- Date: 2026-10-10 · Status: approved in conversation ("ㄱㄱ" on mockup v13)
- Base branch: `feat/owner-accounts` (owner accounts, not yet merged to main). Work branch: `feat/admin-redesign`.
- Screens: `docs/mockup-v13.html` (N1, N2, A1, A2, A3). Typography/readability: `2026-10-10-motion-typography-design.md` §4. All earlier specs still bind.

## 1. Number ticker (from tbd studio)
- Component `NumberTicker({ value, unit })`: one fixed-width slot per digit (Geist Mono, tabular), each slot a reel of 0–9 that rolls (translateY) to its digit when the element enters the viewport (IntersectionObserver, threshold ≈ 0.4), 1.4s `cubic-bezier(.22,.61,.36,1)`, 90ms stagger per digit, once. Unit in Noto Sans KR at ~0.42em beside it.
- Accessibility: the real value + unit in a visually hidden span; the reels are `aria-hidden`. SSR/no-JS and `prefers-reduced-motion`: render the final digits directly (no invisible numbers before hydration).
- Pure helper `digitsOf(n)` / formatting tested; thousands separators get a static separator slot.
- Apply to: R1 stats band, home stats if present, owner "내 공실" card numbers (candidates count, N/50), admin A1 to-do counts, admin side-menu counts (static, no roll, to stay calm).
- Never animate the fixed phrase "응답자 N명 중 M명이 이용 의향" — it stays plain text.

## 2. Space photo as avatar
- The owner's first uploaded photo is the space's **cover/avatar**; owners can pick another uploaded photo as cover ("사진 바꾸기") and add photos later on their space while pending or active.
- Data: `spaces.cover_key TEXT` (migration `0006_space_cover.sql`), defaulting to the first key in `photo_keys`.
- Public serving: new route `/media/space/:slug/cover` that streams the cover from R2 **only when the space is `active` and `owner_consent = 1`**, with `Cache-Control: public, max-age=3600`, `X-Content-Type-Options: nosniff`, image content types only. Admin and owner routes keep serving photos of their own/any space as before.
- Avatar component: rounded square (sizes 40/56/88px), `object-fit: cover`, alt "공실 대표 사진"; fallback tile with the first Korean character of the 동 (or space name) on `--soft` background.
- Show it on: owner B2 cards, admin A1 pending list, A2 space list, A3 application header, public `/find` result cards and R1 hero (small, beside the eyebrow).

## 3. Admin redesign (A1–A3)
- Shell: left side menu (PC) with 할 일 · 공실 · 신청 · 건물주 and counts (a soft yellow pill when there is work); on < 1024px it becomes a top tab bar. Remove the single long dashboard.
- **할 일** (`/admin`): four count cards that link to filtered lists — 공실 승인 대기, 결과 메일 안 보냄 (evaluated, `result_mailed_at` null), AI 평가 실패, 이번 달 매출 미기록 (쓸모 트랙, active consulting, no row for current month). Cards with work get the yellow treatment; zero work → "처리할 일이 없어요". Below: the pending-space queue with approve/reject.
- **공실** (`/admin/spaces`): search (name/동), stage chips (전체 / 승인 대기 / 의견 모으는 중 / 후보 준비됨 / 반려 / 비공개) via `?status=`; rows: avatar, name, 구·동 · 건물주 or "운영자 등록", stage cell (for collecting: "주민 의견 N / 50명" + progress bar; for ready: "후보 N명"), action ("QR · 상세" / "승인·반려").
- **신청** (`/admin/applications`): chips (전체 / 평가 중 / 메일 보낼 차례 / 건물주 검토 중 / 실패) via `?status=`; rows: space avatar, 신청자 · 업종, 공실, AI 점수(참고용), 트랙, one plain status word, next-action button.
- **건물주** (`/admin/owners`): list of owners (name, email, phone, spaces count, last login).
- Detail pages (space, application): header with avatar + title; a **progress line** (application: 신청 → AI 평가 → 결과 메일 → 건물주 검토 → 계약(공인중개사)); a **"다음 할 일" box** computed from state (e.g. send result link, re-evaluate failed AI, approve pending space, record this month's revenue); secondary data (consulting months, educator links, PII, files) in collapsible sections below.
- Plain-language status words everywhere; no abbreviations like "응답 0 · 반려".
- Pure helpers with tests: `adminTodoCounts(db, now)`, `spaceStage(space, counts)`, `applicationStage(app)`, `nextAction(entity)`.

## 4. Data hygiene
- e2e runs left many "e2e 공간…/승인e2e…" rows in the local DB. Make e2e-created rows identifiable (name prefix) and add an e2e global teardown that deletes rows it created; `npm run db:seed` keeps resetting to seed-only. Do not touch production data paths.

## 5. Testing
- Unit (TDD): digit helper, todo counts, stage/next-action helpers, cover-route gating (pending/rejected/unconsented → 404), cover default and change.
- E2E: A1 shows the four counts matching seed; clicking a card opens the filtered list; A3 shows the next-action box; owner can change cover and it appears on the admin list; `/media/space/:slug/cover` 404s for a pending space; ticker shows final digits with reduced motion. Keep all existing tests green on **Windows and Linux** (use shell-safe commands; wait for navigations/POSTs before reading other pages; don't share mutable seed rows across parallel specs).

## 6. Change (user decision, 2026-10-10): photo changes on public spaces need operator approval
- On an `active` space, an owner's added photos and cover changes are **staged** (`pending_photo_keys`, `pending_cover_key`, migration `0007_photo_review.sql`); the public cover keeps the last approved photo. Pending spaces still change directly (the whole space is under review).
- Owners see their own proposal plus a notice ("운영자 확인 중"). Admin home lists "사진 변경 확인" (current → proposed cover, new photos) with approve/reject; rejecting deletes the never-published uploads from R2. The "공실 승인 대기" to-do count includes these.

