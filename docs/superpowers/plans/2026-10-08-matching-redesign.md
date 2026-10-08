# Matching redesign — implementation plan (2026-10-08)

Source of truth: `docs/mockup-matching.html` (v7) + `docs/spec.md`. Branch `feat/matching-redesign`; work happens on `wip/design` (worker 1) and `wip/matching` (worker 2) in separate git worktrees, then merged here.

## Shared interfaces (agreed up front)
- `app/lib/survey.ts` (done on the base branch, no runtime imports): `BUSINESS_CATEGORIES` (3 cards) and `categoryOf(type)`.
- Theme tokens in `app/app.css` (worker 1 owns): `ink #1D1D1B`, `paper`, `soft #FAFAF7`, `muted #6F6D68`, `line #E8E6E1`, `yellow #FFF0A6`, `yellow-deep #F2D65C`, `green #D3F0BF`, `green-deep #8FCB6E` → Tailwind classes `bg-yellow`, `border-yellow-deep`, `bg-green`, `border-green-deep`, `bg-soft`, `text-muted`, `border-line`. The `accent` colour is removed. Worker 2 uses these class names only.
- `app/components/ui.tsx` (worker 1 owns): keeps `Shell({wide?})`, `Title`, `Section`, `Question`, `Choice`, `TextInput`, `TextArea`, `Consent`, `SubmitButton`, `ErrorNote`; adds `Hl` (the single headline highlight), `NavBar`, `Card({top?, selected?})`. Worker 2 builds its own screens in `app/components/matching.tsx` and `app/routes/find.tsx`, importing `Shell`, `Title`, `Hl`, `Card` from ui.tsx (worker 2 may add a minimal temporary stub on its branch; the merge keeps worker 1's version).
- DB: `spaces.district TEXT` (e.g. "성동구"), migration `0003_space_district.sql` (worker 2).
- Pure logic: `app/lib/matching.ts` (no runtime imports beyond types), tests `tests/matching.test.ts` written first.

## Tasks
1. Worker 1 (`wip/design`): fonts, tokens, golden type scale, highlight/selection style, thin-border cards, keep-all wrapping, responsive Shell + PC nav, restyle all existing screens (home, survey, report, apply, result, admin) to the mockup; remove orange; survey type picker shown as 3 category cards.
2. Worker 2 (`wip/matching`): migration, spaces.server district, admin form field (required), seed (mangwon-01 마포구 + 성동구 spaces ≥ 50 responses, one under 50), matching.ts + tests, `/find` route, `/spaces` → `/find` redirect, home link, apply `?type=` prefill, e2e matching test.
3. Lead: merge, full checks, reviewer subagent, fixes, report.

## Files
worker 1: app.css, root.tsx, components/*, routes/{home,survey,public-report,apply,result,admin-*}.tsx (styling only; apply prefill is worker 2's — a tiny, separate edit).
worker 2: migrations/0003*, scripts/seed.ts, app/lib/{matching.ts,spaces.server.ts}, routes/{find,spaces,admin-space-new}.tsx, routes.ts, tests/*, e2e/*, minimal edit in apply.tsx and home.tsx links.
