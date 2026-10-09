# 쓸모 AI 평가 구현 계획 (2026-10-10)

Spec: `docs/superpowers/specs/2026-10-10-ai-screening-design.md` §1–11. Mockup: `docs/mockup-v8.html`.
Branch `feat/ai-screening`. TDD for every pure/server module (test fails first).

## Work split
1. **Backend (lead, sequential, first):** migration 0004, pure modules, evaluator, mail, server data functions, tests. Everything the screens call exists and is tested before UI work starts.
2. **Worker A (applicant/owner screens):** `/r/:slug` (R1), `/apply/:slug` (P6'), `/result/:token` (P8'), new `/o/:token` (O1), brand rename in UI, remove paid-feedback UI from the applicant flow.
3. **Worker B (admin + seed):** `/admin/spaces/:id` (A4'), `/admin/applications/:id` (A5'), admin list columns, `scripts/seed.ts`.
4. Lead merges, writes e2e, runs all checks, reviewer subagent, report.

## Shared interfaces (all under `app/lib/`)

| File | Exports |
|---|---|
| `revenue.ts` (pure) | `estimateRevenue(answers: SurveyAnswers[], type, {scaleFactor, marginPct}): RevenueEstimate`, `defaultMargin(type)`, `visitsPerMonth`, `spendMidpoint`, `REVENUE_RANGE` |
| `shortlist.ts` (pure) | `SHORTLIST_MIN_SCORE=60`, `SHORTLIST_MAX=5`, `shortlist(items)` |
| `ai-report.ts` (pure) | `type AiReport`, `validateAiReport(raw: unknown): ParseResult<AiReport>`, `SECTION_LABELS` |
| `ai-prompt.ts` (pure) | `type EvalInput`, `buildPrompt(input): {system, user}` — input type has no name/email |
| `consulting.ts` (pure) | `FEE_RATE=0.01`, `consultingFee(revenue, profit)`, `parseConsultingMonth(form)`, `parseEducatorLink(form)` |
| `evaluator.server.ts` | `interface Evaluator { name; evaluate(input): Promise<{report: AiReport; model: string}> }`, `fakeEvaluator`, `createAnthropicEvaluator(apiKey, fetchImpl?)`, `pickEvaluator(env)` |
| `mail.server.ts` | `type Mailer`, `resendMailer(env)`, `mailerFromEnv(env): Mailer \| null` |
| `evaluation.server.ts` | `buildEvalInput(db, applicationId)`, `runEvaluation(db, applicationId, {evaluator, mailer, origin, now})`, `markPending(db,id)` |
| `owner.server.ts` | `ensureOwnerToken(db, spaceId)`, `regenerateOwnerToken(db, spaceId)`, `getOwnerView(db, token): OwnerView \| null`, `listShortlist(db, spaceId)` |
| `consulting.server.ts` | `addConsultingMonth(db, appId, input)`, `listConsultingMonths`, `addEducatorLink`, `listEducatorLinks` |
| `spaces.server.ts` (ext.) | `Space` gains `location_notes, owner_token, margin_pct, scale_factor`; `saveSpaceSettings(db, id, {...})`, `parseSpaceSettings(form)` |
| `applications.server.ts` (ext.) | `parseApplication` returns `track`, consents; `createApplication` stores them and `ai_status='pending'`; `getResultByToken` returns AI view; `Application` type extended; `setResultMailed` |
| `revenue.server.ts` | `loadRevenueEstimate(db, space, type)` |

### Report JSON (`applications.ai_report`)
```ts
type AiReport = {
  score: number;                 // 0–100 integer
  verdict: "fit" | "improve" | "rethink";
  summary: string;               // ≤ 300 chars
  strengths: string[];           // ≤ 3
  risks: string[];               // ≤ 3
  sections: { demand_fit: string; pricing: string; hours: string; cost_risk: string; suggestions: string };
  notes?: string[];              // e.g. "첨부 파일은 PDF가 아니어서 분석에서 제외했어요"
};
```

### Migration 0004 columns
See spec §4 verbatim. `applications.result_verdict/result_summary` are filled from the report on success.

### Env (all optional)
`EVALUATOR` (`fake` | `anthropic`), `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `MAIL_FROM`.
Evaluator chosen by `pickEvaluator`: fake if `EVALUATOR=fake` or key missing.

## Rulings made up front
- R-1 Brand copy 쓸모 everywhere in UI/README; slugs, repo, package name unchanged.
- R-2 The estimate uses *respondents who picked the type* only; unit tests pin the numbers.
- R-3 Evaluation is triggered by `ctx.waitUntil`; the applicant page shows "평가 중" until `ai_status='done'`.
- R-4 Result mail only contains the link; sent at evaluation success when configured.
- R-5 Owner view excludes `contact_name`, `email`, `plan_text` at the SQL level (explicit column list).
- R-6 Money items stay `TODO(legal)`.
