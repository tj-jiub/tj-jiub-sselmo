# 쓸모 (Ssulmo) prototype
1. Local: `npm install && cp .dev.vars.example .dev.vars && npm run db:migrate && npm run db:seed && npm run dev` → http://localhost:5173 (admin: admin@ssulmo.local / ssulmo-dev)
2. Env (`.dev.vars` locally, `wrangler secret put` in prod): `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` (`node scripts/hash-password.ts <pw>`), `SESSION_SECRET`.
   Optional: `EVALUATOR` (`fake` = deterministic evaluator for local dev/tests only; **production must never set `EVALUATOR=fake`**. Without it and without `ANTHROPIC_API_KEY`, evaluations end as `failed` with an explanatory `ai_error`), `ANTHROPIC_API_KEY` (AI evaluation, model claude-sonnet-5-5), `RESEND_API_KEY` + `MAIL_FROM` (auto result mail; without them the admin copies the link by hand).
3. Bindings (`wrangler.json`): D1 `DB` (database `ssulmo`), R2 `UPLOADS` (bucket `ssulmo-uploads`).
4. Deploy: `wrangler d1 create ssulmo` → paste id into `wrangler.json`; `wrangler r2 bucket create ssulmo-uploads`;
   `wrangler d1 migrations apply ssulmo --remote`; set the 3 secrets; `npm run deploy`.
5. Tests: `npm test` (unit, Node 24) · `npm run e2e` (Playwright, needs seeded local DB).
6. Open items: `grep -rn "TODO(legal)\|TODO(survey)" app`.
