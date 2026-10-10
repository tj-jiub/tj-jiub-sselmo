# 쓸모 (Ssulmo) prototype
1. Local: `npm install && cp .dev.vars.example .dev.vars && npm run db:migrate && npm run db:seed && npm run dev` → http://localhost:5173 (admin: admin@ssulmo.local / ssulmo-dev)
2. Env (`.dev.vars` locally, `wrangler secret put` in prod): `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` (`node scripts/hash-password.ts <pw>`), `SESSION_SECRET`.
   Optional: `EVALUATOR` (`fake` = deterministic evaluator for local dev/tests only; **production must never set `EVALUATOR=fake`**. Without it and without `ANTHROPIC_API_KEY`, evaluations end as `failed` with an explanatory `ai_error`), `ANTHROPIC_API_KEY` (AI evaluation, model claude-sonnet-5-5), `RESEND_API_KEY` + `MAIL_FROM` (auto result mail; without them the admin copies the link by hand).
3. Bindings (`wrangler.json`): D1 `DB` (database `ssulmo`), R2 `UPLOADS` (bucket `ssulmo-uploads`).
4. Deploy: `wrangler d1 create ssulmo` → paste id into `wrangler.json`; `wrangler r2 bucket create ssulmo-uploads`;
   `wrangler d1 migrations apply ssulmo --remote`; set the 3 secrets; `npm run deploy`.
5. Tests: `npm test` (unit, Node 24) · `npm run e2e` (Playwright, needs a migrated + seeded local DB and `.dev.vars` copied from `.dev.vars.example`, which sets `DEV_SHOW_LOGIN_LINK=1` and `EVALUATOR=fake`).
6. Open items: `grep -rn "TODO(legal)\|TODO(survey)" app`.

## 관리자 보안
- `/admin*` 은 Cloudflare Access(One-time PIN, 운영자 이메일만 허용) 뒤에 두세요. 별도 관리자 호스트명을 쓰는 것도 좋아요. 앱 자체의 로그인은 2차 방어선이에요.
- 운영(production)에서는 `DEV_SHOW_LOGIN_LINK`와 `EVALUATOR=fake`를 **절대** 설정하지 마세요. (둘 다 로컬/e2e 전용)
- 관리자 로그인은 IP당 15분에 5번 실패하면 잠겨요(429). `/admin*`, `/owner*` 응답에는 `X-Robots-Tag: noindex, nofollow`가 붙고 공개 화면에는 관리자 링크가 없어요.

## 건물주 계정
- 흐름: `/owner`에서 이메일로 로그인 링크를 받아 로그인 → 이름·연락처·약관 동의 → 공실 등록(사진 선택) → 운영자가 `/admin`의 "확인 대기 공실"에서 승인해야 공개 → 주민 응답이 모이면 후보 카드(★·메모)를 확인해요. 반려하면 사유가 건물주 화면에 보여요.
- 로컬: 시드 건물주 `owner@ssulmo.local`(공실 `seongsu-01` 보유, 확인 대기 공실 1건). http://localhost:5173/owner 에서 이메일을 넣으면, `.dev.vars`에 `DEV_SHOW_LOGIN_LINK=1`일 때 로그인 링크가 화면에 바로 보여요(로컬/e2e 전용).
- `RESEND_API_KEY` + `MAIL_FROM`이 없으면 메일은 발송되지 않아요.
- 건물주 메모는 운영자와 공유돼요(관리자 화면에서 읽기 전용). 로그인 링크 요청은 이메일당 10분 3회, IP당 1시간 20회로 제한돼요.
