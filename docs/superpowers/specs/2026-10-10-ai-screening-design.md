# 쓸모 2단계 설계: 수요 기반 모집 · AI 사업성 평가 · 건물주 후보 전달 · 쓸모 트랙

- Date: 2026-10-10
- Status: approved in conversation 2026-10-10, written spec under review
- Base branch: `feat/matching-redesign` (redesign + /find matching), work branch `feat/ai-screening`
- Canonical brief stays `docs/spec.md`; this document adds to it and wins where they conflict.

## 1. Goal

Turn a vacant space into a useful one ("쓸모") with this loop:

1. The operator (쓸모) gets the building owner's consent to run the project.
2. Residents answer the QR survey; the top-demand business type emerges (e.g. 베이커리).
3. 쓸모 shows an **estimated monthly revenue and net profit** for that type and recruits founders with it.
4. Founders apply for free. An **LLM evaluates every application** using the survey data, the space's location facts and the business plan.
5. Every applicant automatically receives a result link (free summary + free detailed report during the open beta).
6. The **top 5** (above a minimum score) per space are shown to the building owner on an **owner page** — for the owner this is a tenant-screening tool.
7. The owner and a **licensed real-estate broker** negotiate and sign the lease. 쓸모 takes no part in the lease and takes no fee for it.
8. Founders who applied through the **쓸모 트랙** have a separate consulting agreement with 쓸모: **0원 in a loss month; a set % of revenue in a profit month** (default 1%: 1,000만원 revenue → 10만원).

Success: the operator can run a real pilot on 1–3 spaces without writing feedback by hand, and can present ≤ 5 well-evaluated candidates to an owner from one link.

## 2. Business-model rules (fixed)

- Revenue sources: (a) 쓸모 트랙 consulting fee, revenue-linked, loss months free; (b) later: owner-facing data reports, public-sector contracts. **Never** a fee for introducing a tenant or concluding a lease.
- The consulting agreement is between 쓸모 and the founder, **separate from the lease**. Choosing the 쓸모 트랙 is the applicant's choice at application time; it is a condition of the 쓸모 트랙 service (candidate recommendation, demand data, "주민이 선택한 가게" certification, resident opening alert, consulting), **not** a condition of the lease. Applicants on the 일반 트랙 are evaluated the same way and can still be shortlisted. 쓸모 never asks owners to require consulting.
- The 10,000원 paid applicant report is **dropped**. Detailed reports are free, labelled "오픈 베타 기간 무료". The old bank-transfer / paid-feedback UI is removed from the applicant flow.
- Copy leads with the consulting deal's main benefit: "손해 본 달은 0원, 번 달만 매출의 1%".
- Every money-related item stays marked `TODO(legal)` until a lawyer reviews it.

## 3. Screens (mockup v8 must be approved before UI work)

| ID | Route | Who | What |
|---|---|---|---|
| R1 | `/r/:slug` (extended) | public | Recruiting page: top type, fixed demand phrase, **estimated monthly revenue / net profit range with its basis and "추정치이며 보장하지 않아요"**, 쓸모 트랙 benefits, apply button |
| P6' | `/apply/:slug` | founder | Adds **track choice** (쓸모 트랙 / 일반) with consulting terms consent for 쓸모 트랙, and an **AI processing consent** |
| P8' | `/result/:token` | founder | Verdict + free summary + detailed 5-section report ("AI가 작성한 평가", beta-free label); 쓸모 트랙 status |
| O1 | `/o/:token` | owner (no login) | Space summary + demand basis + up to 5 candidate cards (type, 점수(참고용), summary, strengths, risks, track). **No name, email or plan text.** Note that the lease is handled with a licensed broker |
| A4' | `/admin/spaces/:id` | admin | + location facts, margin assumption, revenue estimate preview, "건물주 링크 만들기/복사", shortlist preview |
| A5' | `/admin/applications/:id` | admin | AI report, status, re-evaluate; result-mail status (auto or manual copy); 쓸모 트랙 block: consulting status, **monthly revenue log** (month, revenue, profit/loss) with computed fee; educator connection record |

Rename the brand in all UI copy from 썰모 to **쓸모**.

## 4. Data (migration `0004_ai_screening.sql`)

`spaces` +
- `location_notes TEXT` — operator-entered location facts (e.g. "한양대 정문 앞, 2호선 한양대역 도보 3분").
- `owner_token TEXT UNIQUE` — random 128-bit token for `/o/:token`; created on demand, can be regenerated.
- `margin_pct INTEGER` — net-margin assumption for the estimate; NULL = use the type default.
- `scale_factor REAL NOT NULL DEFAULT 1` — respondents → real customers multiplier the operator can tune; shown in the basis text.

`applications` +
- `track TEXT NOT NULL DEFAULT 'general' CHECK (track IN ('ssulmo','general'))`
- `consent_ai_at INTEGER` (required for new applications), `consent_consulting_at INTEGER` (required when track = 'ssulmo')
- `ai_status TEXT NOT NULL DEFAULT 'pending' CHECK (ai_status IN ('pending','done','failed'))`
- `ai_score INTEGER CHECK (ai_score BETWEEN 0 AND 100)`, `ai_report TEXT` (JSON, see §5), `ai_model TEXT`, `ai_evaluated_at INTEGER`, `ai_error TEXT`
- `result_mailed_at INTEGER` — set by auto mail or by the operator's manual tick.
- Existing manual fields (`result_verdict`, `result_summary`, `reference_score`, paid-feedback columns) stay in the schema for compatibility but are no longer written by the UI; `result_verdict`/`result_summary` are filled from the AI report so existing pages keep working.

New tables:
- `consulting_months (id, application_id, month TEXT 'YYYY-MM', revenue_krw INTEGER, profit_krw INTEGER, fee_krw INTEGER, created_at, UNIQUE(application_id, month))` — only for `track = 'ssulmo'` (trigger-enforced). `fee_krw = profit_krw > 0 ? round(revenue_krw × FEE_RATE) : 0`.
- `educator_links (id, application_id, organization TEXT, educator_name TEXT, connected_on TEXT, created_at)`.

## 5. AI evaluation

- Model `claude-sonnet-5-5` via the Anthropic Messages API (implementation must follow the `claude-api` skill). Key in `ANTHROPIC_API_KEY` (wrangler secret). `EVALUATOR=fake` selects a deterministic fake evaluator used by tests, e2e and local dev without a key.
- Trigger: after an application is stored, run the evaluation with `ctx.waitUntil` (the applicant does not wait). Failure → `ai_status='failed'` + `ai_error`; admin "재평가" retries.
- Input (no name, no email): space name/neighborhood/district/location_notes; survey aggregates (total N, per-type counts, spend, visit time, frequency, respondent mix); revenue estimate for the applicant's type; application business type, plan text, estimated cost; PDF attachment only when the upload is a PDF (HWP/DOCX ignored, noted in the report).
- Output (validated JSON; invalid → failed):
  `{ score 0–100, verdict: "fit"|"improve"|"rethink", summary ≤ 300자, strengths: ≤3 strings, risks: ≤3 strings, sections: { demand_fit, pricing, hours, cost_risk, suggestions } }` — Korean, plain, no guarantees.
- Shortlist (pure function, tested first): per space, applications with `ai_status='done'` and `score ≥ SHORTLIST_MIN_SCORE` (default 60), ordered by score desc then earliest application, **max 5**.

## 6. Revenue estimate (pure function, tested first)

For a business type T at a space:
- Respondents who chose T: each contributes `visits_per_month(frequency) × spend_midpoint(spendRange)`.
  - visits/month: weekly3 → 13, weekly1 → 6, monthly → 2, rarely → 0.5
  - spend midpoint (원): lt5k → 4,000, 5to10k → 7,500, 10to20k → 15,000, gt20k → 25,000
- `monthly_revenue = Σ contributions × scale_factor`; shown as a range ×0.7 – ×1.3, rounded to 10만원.
- `net_profit = monthly_revenue × margin` (space `margin_pct` or a type default table, e.g. 카페 15%, 베이커리 15%, 아이스크림·디저트 18%, 분식 12%, 반찬가게 10%, others 12%), same range.
- Always rendered with its basis ("응답자 중 OO명이 고른 업종, 1회 지출·방문 빈도 기준, 환산 배수 X") and "추정치이며 실제 매출을 보장하지 않아요." Hidden below the 50-response threshold (shows "집계 중").

## 7. Result delivery

- `RESEND_API_KEY` + `MAIL_FROM` set → send the result link automatically when the evaluation finishes; set `result_mailed_at`.
- Not set → nothing is sent; the admin page shows "링크 복사" and a "결과 메일 보냄" tick (current behaviour).
- Mail contains only the link and a one-line greeting; no evaluation content in the mail body.

## 8. Consents and legal (`TODO(legal)` in code)

- New required consent on apply: AI 분석을 위한 처리위탁·국외이전 (Anthropic, US). Wording placeholder.
- 쓸모 트랙 consulting terms: loss month 0원, profit month revenue × rate; separate from the lease; can be declined by choosing 일반 트랙.
- "AI가 작성한 평가" notice on result and owner pages.
- Revenue estimate disclaimer.
- Lawyer review before charging any fee: consulting fee structure, relation to the owner presentation, 가맹사업법 applicability, 중개 boundary.

## 9. Error handling

- LLM timeout/HTTP error/invalid JSON → `failed`, error stored, applicant result page shows "평가 중이에요" until success; admin can retry.
- Owner token unknown → 404. Regenerating the token invalidates the old link.
- Consulting month entries rejected for non-쓸모-트랙 applications (trigger) and for malformed months/amounts (parser).

## 10. Testing

- Unit (TDD): revenue estimate, shortlist, AI output validator, prompt builder (asserts no name/email), fee calculation, consulting-month parser, consent parsing for both tracks, DB triggers.
- Integration with the D1 shim: submit → fake evaluation → result/owner views.
- E2E (`EVALUATOR=fake`): apply on 쓸모 트랙 → result shows report; owner link shows ≤ 5 cards without names/emails; admin records a consulting month and sees the fee.

## 11. Out of scope (memo for later)

Real payments/fee collection, e-contracts, owner accounts, automated revenue verification (POS), resident pre-support funding, opening-alert sending, demand index product, sponsorships, university programs, owner-paid reports, master-lease model.

## 12. Later: founder business-management SaaS (lock-in) — not in this build

Goal: after opening, 쓸모 트랙 founders manage their shop in 쓸모 (sales, monthly P&L, resident regulars/alerts). This also replaces self-reported revenue for the consulting fee with verified numbers.
Phased path (feasibility checked 2026-10-10):
1. **Now (this build):** monthly self-report of revenue and profit/loss in the admin, fee computed automatically.
2. **Next:** founder-facing monthly entry + receipt/statement upload; simple sales dashboard.
3. **Card-sales sync:** merchants can already view card approvals via the 여신금융협회 가맹점 매출 통합조회; incumbents (캐시노트 등) aggregate this with merchant consent. Integrating needs a data-aggregator contract or the association's third-party terms — not confirmed for CODEF; must be checked. Never store merchant passwords ourselves.
4. **POS partnership:** no public open API found for 토스플레이스 POS (data is owner-facing today); requires a partner agreement — later, once there is volume.
Differentiator vs 캐시노트-type tools: resident demand data + resident regulars/opening alerts for that exact location, tied to the consulting deal. Legal: 신용정보법/개인정보 consent for financial data — `TODO(legal)`.
