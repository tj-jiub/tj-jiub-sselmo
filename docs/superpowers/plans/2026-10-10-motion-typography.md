# Plan: motion + typography build (2026-10-10)

Spec: `docs/superpowers/specs/2026-10-10-motion-typography-design.md` (§1–5). Look/motion source: `docs/mockup-v11.html`, `docs/mockup-v9-focus.html`.

## Milestones
1. **Foundation (lead, test-first)**
   - Evaluator safety: `pickEvaluator` returns the fake only for `EVALUATOR=fake`; otherwise a missing key yields an evaluator that throws a clear `ANTHROPIC_API_KEY` error → `runEvaluation` stores `ai_status='failed'` + `ai_error`. Tests: `tests/evaluator.test.ts`, `tests/evaluation.test.ts`. README warning.
   - Pure helper `app/lib/scroll-typing.ts` (`scrollProgress`, `litCount`, `splitWords`, `easedStep`) + `tests/scroll-typing.test.ts`.
   - Typography tokens in `app/app.css` (muted #5f5d58, 15px floor, Geist Mono for digits via `.num`, trimmed highlight gradient) and the continuous-page CSS (`.cp-*`, `.rv`).
   - Shared components `app/components/motion.tsx`: `ContinuousPage`, `Reveal`, `Hero`, `Say`, `SplitList`/`FocusRow`, `StackSection`/`StackCard`/`NumberedList`, `Stats`, `Cta`, `Notice`, `FocusSteps`/`StepPanel`. Behaviour (reveal, scroll-typing, focus rows, card dimming, eased wheel) lives in `useContinuousPage`; routes only assemble markup. `html.mo` (set by an inline script in `root.tsx` when motion is allowed) arms the reveal/typing CSS, so no-JS and reduced-motion show everything.
2. **Parallel workers (git worktrees, disjoint files)**
   - W1: `routes/public-report.tsx` (R1) + `routes/home.tsx`.
   - W2: `routes/owner.tsx` (O1) + `routes/find.tsx` + `components/matching.tsx` (one question per screen, results continuous).
   - W3: readability/de-clutter on `apply`, `result`, `survey`, `admin-*` routes (normal scroll, 16px, grouping). Does not touch `app.css`, `motion.tsx`, `ui.tsx` (asks lead).
3. **Merge + checks** typecheck, vitest, playwright; e2e additions (R1 statement/phrase/disclaimer; O1 no applicant name/email); screenshots 390/1280 → `docs/superpowers/reports/screens-2026-10-10/`.
4. **Review** one fresh reviewer vs spec + mockup v11; fix Critical/Important test-first.
5. **Report** (Korean) `docs/superpowers/reports/2026-10-10-motion-typography.md`.

## Fixed rules kept
"응답자 N명 중 M명이 이용 의향" phrase; 50-response threshold (also hides revenue estimate); revenue disclaimer; owner page ≤5 candidates and no name/email/plan text; broker notice; AI-written notice; owner-consent 404.
