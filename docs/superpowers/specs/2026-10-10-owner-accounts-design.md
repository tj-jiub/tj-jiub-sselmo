# 쓸모 건물주 계정 + 관리자 보안 설계

- Date: 2026-10-10 · Status: approved in conversation (mockup v12 + decisions below)
- Base: `main` (3a4d204). Work branch: `feat/owner-accounts`.
- Screens: `docs/mockup-v12-owner.html` (B1, B1-1, B2, B3, B4, B4·m). Look/typography rules: `docs/superpowers/specs/2026-10-10-motion-typography-design.md` §4 (owner pages are tool pages: normal scroll, no motion layer).
- Still binding: `docs/spec.md`, `2026-10-10-ai-screening-design.md`, `2026-10-10-motion-typography-design.md`.

## 1. Roles
| Role | Who | Auth | Can |
|---|---|---|---|
| Admin | the 쓸모 operator only | existing email+password session, behind Cloudflare Access in production | everything; approves owner-registered spaces; sees owner memos |
| Owner (new) | building owners | passwordless email magic link | own spaces only: register, see stage + own response count, QR, candidates (no applicant PII) with ★ + memo |
| Applicant | founders | none (unchanged) | apply, result link |

## 2. Decisions (user, 2026-10-10)
1. Owner memos are visible to the admin. The owner UI says "메모는 운영자와 공유돼요".
2. Login: **email magic link first**. Kakao later (out of scope).
3. The token owner link `/o/:token` is **removed** — owners use their account. Delete the route, the admin "건물주 링크" UI and its tests; leave the `owner_token` column unused (no destructive migration).
4. Admin entry is removed from every public screen (home role card, nav). Admin stays at `/admin` but is unlinked, `noindex`, and documented to sit behind Cloudflare Access.

## 3. Data (migration `0005_owner_accounts.sql`)
- `owners (id, email UNIQUE COLLATE NOCASE, name, phone, consent_terms_at, consent_privacy_at, created_at, last_login_at)`
- `owner_login_tokens (id, email, token_hash UNIQUE, expires_at, used_at, created_at)` — store SHA-256 of a 32-byte random token; 15-minute expiry; single use.
- `spaces` + `owner_id INTEGER REFERENCES owners(id)` (NULL for admin-created) and `status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending','active','rejected'))`. Owner-registered spaces start `pending` with `owner_consent = 1` (the owner's "소유자예요" check is the consent) and become public only when the admin sets `active`. **Every public gate (`getPublicSpace`, /find tallies, /spaces) requires `status = 'active'` AND `owner_consent = 1`.**
- `candidate_marks (owner_id, application_id, starred INTEGER 0/1, memo TEXT, updated_at, PRIMARY KEY(owner_id, application_id))`.
- `auth_attempts (key TEXT, created_at)` for rate limiting (see §6).

## 4. Owner flows (screens B1–B4)
- `/owner` (B1): email field → "로그인 링크 받기". Always answers the same neutral message (no account enumeration). Creates a token and mails `/<origin>/owner/verify?token=…` via Resend when `RESEND_API_KEY` + `MAIL_FROM` exist. Without them: if `DEV_SHOW_LOGIN_LINK=1` (only in `.dev.vars.example`), show the link on the page for local dev/e2e; otherwise show the neutral message only and log nothing sensitive.
- `/owner/verify`: valid + unused + unexpired → mark used, upsert owner by email, set `ssulmo_owner` signed httpOnly session (separate secret context from admin), redirect to `/owner/welcome` if name/consents missing else `/owner/spaces`. Invalid → friendly error with a link back.
- `/owner/welcome` (B1-1): name, phone, [필수] 이용약관, [필수] 개인정보 수집·이용 (wording `TODO(legal)`).
- `/owner/spaces` (B2): my spaces as cards showing one stage — `운영자 확인 대기` (pending) / `주민 의견 모으는 중 N/50명` / `후보 평가 완료 N명` (shortlist count) / `반려됨`. The owner sees their **own** response count even below 50; public pages still show only "집계 중". Actions: 후보 보기, 동네 의견(link to /r/:slug when active), QR 받기 (reuse QrDownload), 수정 (name/location notes only while pending).
- `/owner/spaces/new` (B3): name, 구, 동, 위치 특징, photos optional (R2, ≤5, reuse upload checks), [필수] 소유자 확인 (`TODO(legal)`: how much ownership verification is needed). No rent/deposit fields. Creates a `pending` space with a generated slug.
- `/owner/spaces/:id/candidates` (B4): the AI shortlist (score ≥ 60, max 5) with type, 점수(참고용), summary, strengths/risks, track, est. cost — **never name/email/plan text/file keys, not even in loader data**. ★ toggle and memo per candidate saved via fetcher (debounced autosave + explicit save fallback), filter chips 전체/관심. Notice: AI-written; contract via licensed broker; 쓸모 takes no fee for introductions.
- Isolation: any `/owner/*` route for a space or application not owned by the signed-in owner returns 404. Logged-out → redirect to `/owner`.
- Logout on `/owner/logout` (POST).

## 5. Admin changes
- Home and public nav: remove the "관리자예요" card/link; add "건물주이신가요? 공실 등록하기" → `/owner`.
- `/admin`: a "확인 대기 공실" queue (approve → `active`; reject → `rejected` with optional reason shown to the owner).
- Admin space page: owner name/email/phone; per candidate the owner's ★ and memo (read-only).
- Admin application page: owner ★ + memo if any.
- `/admin*` responses get `X-Robots-Tag: noindex, nofollow` and `<meta name="robots" content="noindex">`.
- README: a short "관리자 보안" section — put `/admin*` (or an admin hostname) behind Cloudflare Access with the operator's email (One-time PIN); never set `DEV_SHOW_LOGIN_LINK` or `EVALUATOR=fake` in production.

## 6. Abuse limits
- Owner link requests: max 3 per email per 10 minutes and 20 per IP per hour (`auth_attempts`); over the limit → same neutral message.
- Admin login: max 5 failed attempts per IP per 15 minutes → 429 with a Korean message.

## 7. Testing (TDD for logic)
- Unit: token create/verify (hash stored, expiry, single use, wrong token), owner upsert, rate limiter, ownership guard helpers, candidate projection has no PII fields, marks upsert, pending spaces invisible to every public gate, approval/rejection.
- E2E (`DEV_SHOW_LOGIN_LINK=1`, `EVALUATOR=fake`): owner logs in via the shown link → welcome → registers a space → it is not public → admin approves → public page opens and owner sees "주민 의견 모으는 중"; owner on a seeded active space stars a candidate + writes a memo → admin sees the memo; owner B cannot open owner A's candidates (404); home has no admin link.
- Keep all existing tests green; remove only tests of the deleted `/o/:token` feature, replacing their privacy assertions with the same assertions on `/owner/spaces/:id/candidates`.
- Seed: one owner (`owner@ssulmo.local`) owning `seongsu-01` with one ★ + memo, plus one `pending` owner-registered space.
