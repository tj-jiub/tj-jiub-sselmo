# 쓸모 화면 개편: 이어지는 스크롤 · 스크롤 타이핑 · 가독성 + 평가기 안전장치

- Date: 2026-10-10 · Status: approved in conversation (mockups v9–v11 iterated with the user)
- Branch: `feat/ai-screening` (contains the AI-screening build). Adds to `2026-10-10-ai-screening-design.md` and `docs/spec.md`; wins on conflicts about look and motion.
- Source of truth for look and motion: `docs/mockup-v11.html` (content pages) and `docs/mockup-v9-focus.html` (question steps only).

## 1. Fix first: evaluator safety (high risk from the last build's report)
- The fake evaluator may run **only** when `EVALUATOR=fake` is set explicitly. If `EVALUATOR` is unset or `anthropic` and `ANTHROPIC_API_KEY` is missing, the evaluation must fail (`ai_status='failed'`, `ai_error` explains the missing key) — never silently fall back to fake.
- `.dev.vars.example` sets `EVALUATOR=fake` so local dev, tests and e2e keep working. README states that production must not set `EVALUATOR=fake`.
- Test first: missing key without `EVALUATOR=fake` → failed; with `EVALUATOR=fake` → fake result.

## 2. Content pages: one continuous page (tbd studio pattern)
Apply to **R1 `/r/:slug`** (recruiting page) and **O1 `/o/:token`** (owner page), and **home `/`**:
- Full-height hero (100dvh) whose bottom dissolves into the next block with `mask-image: linear-gradient(#000 62%, transparent 100%)`.
- **Scroll-typed statement** (neozen pattern): one large sentence (`clamp(32px, 5vw, 67.8px)`, weight 700, line-height 1.236, centered, max ~18em) split into Korean 어절; words go from `#cfcdc8` to ink in order as the block crosses the viewport (from 85% to 35% of the viewport height). R1 sentence: "가게 앞 QR로 모은 주민들의 목소리로, 비어 있는 이 자리에 꼭 맞는 가게와 사장님을 찾아요." O1: a sentence about evaluating candidates against the neighbourhood's demand.
- Sticky heading beside a scrolling list (golden split 1fr / 1.618fr): the row nearest the vertical centre is at full opacity, others at ~0.32; its bar animates to width.
  - R1: demand ranking rows. O1: candidate rows (type, 점수(참고용), summary, strengths/risks) — still max 5, no name/email/plan text.
- Stacked sticky cards (`position: sticky`, tops 110/130/150px) whose lower part fades (`mask-image: linear-gradient(0deg, rgba(0,0,0,.25), #000 50%)`) once the next card overlaps. R1: 예상 매출 / 쓸모 트랙 / 진행 순서.
- Compact stats band, then CTA.
- Reveal: blocks fade up once, 900ms, staggered 160ms; eased wheel scrolling (lerp ≈ 0.075, delta × 0.7) on these pages only; touch and keyboard stay native.
- `prefers-reduced-motion`: no reveal, no lerp, all words lit.
- Mobile (< 760px): single column, sticky heading becomes static, card stacking keeps working with tops ~76px.

## 3. Question steps: one per screen (v9 pattern)
`/find` steps (아이템이 정해졌나요? / 업종 / 구) show one question per 100dvh screen with slow (≈1.1s eased) transitions and a 0.9s staggered entrance. Results lists after the question use the continuous pattern above.

## 4. Typography and readability (all screens, incl. apply and admin)
- Font Noto Sans KR; Geist Mono **only for digits** (rank numbers 01/02, list numbers). Korean labels never in a Latin mono or uppercase-tracked style.
- Minimum text 15px; body 18px on content pages, 16px on forms/admin; card list items 19–22px weight 500 with hairline separators and mono numbers.
- Muted grey `#5f5d58` (was #6f6d68).
- Cards size to content (no fixed min-height leaving half the card empty); card titles up to 41.9px.
- **Highlight overlap fix:** `mark { background: linear-gradient(transparent 11%, hl 11%, hl 89%, transparent 89%) }` with `box-decoration-break: clone` — the plain background bled into the line above at tight display line-heights. Still at most one highlight per screen, headline only.
- Forms and admin keep normal scrolling but follow the readability rules and Miller's law (group, don't pile).

## 5. Testing
- Unit: evaluator selection (§1). Pure helper for the scroll-typing progress (`progress(top, height, vh) → 0..1`, words lit count) with tests.
- E2E: existing 8 keep passing (update selectors honestly where markup changes); add: R1 shows the statement, the demand phrase and the revenue disclaimer; O1 still has no applicant name/email.
- Visual check at 390px and 1280px widths (screenshots in the report).
