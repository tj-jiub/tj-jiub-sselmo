# Ssulmo Prototype Spec

Source: `ssulmo-prototype-prompt.md` (user, 2026-10-07) + decisions agreed in chat 2026-10-07/08.
**This file is the canonical brief.** Where the "Changes" section below conflicts with the original scope text, the change wins.

## Changes from the original prompt (2026-10-08, user decisions on mockup v2)
- **Platform: mobile web** (responsive site opened from QR in the phone browser). No native app; revisit only if a native-only feature (e.g. push) becomes necessary.
- **Home `/` = role selection**: "창업하고 싶어요" → `/spaces` (list of consented spaces, then survey report or apply) and "관리자예요" → `/admin/login`. Residents arrive by QR, so home only tells them to scan the QR.
- **Applying is free.** No fee, bank details or fee consent on `/apply/[slug]`.
  - Contact is a single **email** field (needed to send the result link). No phone number.
  - Required consents at apply: (1) personal-data collection and use, (2) "broker introduction only with separate consent". Optional: broker-introduction opt-in.
- **Review result (free)**: admin writes a one-line verdict (잘 맞아요 / 보완하면 좋아요 / 다시 생각해 보세요) + a short summary. The applicant opens it at `/result/[token]` (unguessable random token, no login).
- **Result email is sent manually** by the admin (copy link → send from own mailbox), then ticked "결과 메일 보냄". No email service integration in the prototype.
- **Written feedback is paid and optional: 10,000원**, requested from the result page. The fee-terms consent ("사업계획서 검토 및 피드백 서비스 이용료; unrelated to contract closing; no guarantee") is collected at that moment. Then bank-transfer instructions; admin ticks payment confirmed, writes feedback, sends it manually, ticks feedback sent.
- The fixed rule "every applicant receives written feedback" is **replaced** by: every applicant receives a free review result; written feedback goes to those who request and pay for it.

## Decisions (ADR-001, accepted 2026-10-07)
- Stack: React Router v7 (framework mode) + TypeScript + Tailwind v4 on Cloudflare Workers, D1 (SQLite) for data, R2 for uploaded files. Chosen over Next.js + Supabase + Vercel: one platform, no Docker for local dev (`wrangler dev` runs D1/R2 locally), free tier never pauses.
- DB access only on the server; no client-side DB access at all.
- Admin auth: single admin, email + PBKDF2 password hash in env vars, signed httpOnly session cookie.
- Survey questions live in one config module and answers are stored as JSON, because the question set will be finalised later with the user (`TODO(survey)`).
- "Would use" (M) for a business type = number of respondents who selected that type. N = total responses for the space. Free-text "기타" answers are shown raw, admin only.
- Public summary threshold: 50 responses for the whole space.
- Reference score: manual 0-100 field labelled "참고용"; criteria decided later.
- Drizzle dropped in favour of plain SQL migrations (`wrangler d1 migrations`) — fewer moving parts for ~5 tables.

## Next iteration (requested 2026-10-08, mockup v4 under review — not built yet)
Mockup: `docs/mockup-matching.html` (https://claude.ai/artifact/KX92kBDanSiYbBJd5dcRt4).
- **Founder matching** replaces the plain `/spaces` list. First question: "사업 아이템이 정해졌나요?"
  - Yes → pick a business type → recommend spaces whose respondents chose that type, most "would use" first.
  - No → pick a preferred district (구) → show that district's spaces with their top-voted type, e.g. "성동구 … 1위 아이스크림·디저트 · 응답자 120명 중 100명이 이용 의향 — 지원해보세요".
  - Requires a district (구) field on spaces (admin form A3).
  - Numbers still only for spaces with ≥ 50 responses; others are listed as "집계 중". The fixed phrase stays "응답자 N명 중 M명이 이용 의향".
- **Responsive (decided 2026-10-08):** phones get a mobile-optimized layout, PCs get the PC layout (same URLs).
- **Ranking:** by "would use" headcount (M), highest first.
- **Miller's law:** keep each screen to ~7±2 items; larger sets go into category cards (business types: 먹거리 / 생활 / 배우기·운동), at most 3 recommendation cards before "더 보기".
- **Korean line breaks only between words** (`word-break: keep-all`), never mid-word.
- **Highlight** looks like a mouse-drag text selection (solid full-line pastel block), not a half-height marker.
- **Highlight sparingly:** at most one highlight per screen, in the headline only. Never put a pastel fill behind numbers or body text (low contrast); emphasise numbers with bold ink. Green is for the bar and the top-card ring only.
- **Font: Noto Sans KR** everywhere (replaces Pretendard).
- **Highlight colour is translucent** (yellow `rgba(255,221,87,.45)`), same as `::selection`. **Card borders are thin 1px lines** (top recommendation: 1px green `#8FCB6E`, no thick ring).
- **Typography:** golden ratio. Scale ×1.618 from 16px (16 / 26 / 42 / 68), captions ÷√φ (12.6px), body line-height 1.618, 61.8/38.2 golden split layouts.
- **Colours:** two pastel accents, yellow `#FFF0A6` and green `#D3F0BF` (deeper `#F2D65C` / `#8FCB6E` for marks), used only as fills; text stays ink `#1D1D1B`. Replaces the single orange accent.

## Scope (verbatim from the prompt)

### A. Space registration (admin only)
- Fields: name, address (neighborhood level), slug, building-owner consent (checkbox) + optional consent-form file upload.
- Without the consent checkbox, the survey link must not be public.
- No rent, deposit, or any lease-term fields.

### B. QR demand survey `/s/[slug]` (public, no login)
- Fields: business type (select 1-3, plus free-text "other"), visit frequency, spend per visit (range), visit time of day, respondent type (resident / office worker / student / passer-by). Completable in 30 seconds.
- Limit one response per device per 24 hours.
- Contact info is optional. Personal-data consent is collected separately from the survey response.
- Admin can download a QR image per slug.

### C. Demand report `/admin/spaces/[id]` and public summary `/r/[slug]`
- Show per business type: "응답자 N명 중 M명이 이용 의향". Never use claims such as "1000+ visitors".
- Public summary shows only "집계 중" while responses < 50. Admin view always shows the data.

### D. Founder application `/apply/[slug]` (public) — superseded in part by "Changes" above
- Fields: target business type, business plan (text + file upload), estimated startup cost, contact info.
- Three separate required consents: (1) personal-data collection and use, (2) "the application fee is for a business-plan review and feedback service; unrelated to contract closing; no guarantee", (3) "broker introduction only with separate consent".
- Application fee: show bank-transfer instructions only. Admin manually ticks "payment confirmed". No payment gateway.

### E. Admin `/admin` (email login, single admin)
- Application list: payment confirmed, feedback text, feedback-sent flag (manual), reference score (labelled "참고용" wherever shown).
- Broker introduction log: founder's introduction consent + broker name + date. Block creating the log when consent is absent. No fee or commission fields.

## Out of scope
Building-owner and broker accounts, e-signature, payment gateway integration, automated notifications (email/Kakao), automatic scoring, maps/search, i18n, multi-admin roles.

## Fixed wording and policy
- The paid feedback is always called "사업계획서 검토 및 피드백 서비스" (10,000원). Every applicant receives a free review result; written feedback only on request + payment.
- No UI or copy that implies money is received from or paid to brokers.
- Vacancy recruitment copy must not include rent or contract terms.
- Minimize collected data. Personal data is visible only in the admin screens.

## Other requirements
- Code, comments, commit messages in English. UI text in Korean.
- Seed data: 1 sample space, 60 survey responses, 3 applications.
- README: local run, env vars, deploy, within 10 lines.
- Uncertain legal/policy matters: mark `TODO(legal)` and report to the user; do not decide.
- Mobile first (users arrive by QR). Monochrome base + one accent colour, no decoration.
