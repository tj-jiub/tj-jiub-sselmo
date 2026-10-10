# 건물주 계정 + 관리자 보안 구현 계획

Spec: `docs/superpowers/specs/2026-10-10-owner-accounts-design.md` §1–§7 · Mockup: `docs/mockup-v12-owner.html` (B1–B4). Branch `feat/owner-accounts` (never main).

## Milestones
1. **M1 — core (TDD, one author).** Migration `0005`, `rate-limit.server.ts`, `owner-auth.server.ts` (token + session + guards), `owner-spaces.server.ts` (ownership, stages, pending/approve/reject), `marks.server.ts` (candidate projection + ★/memo), public gates (`status='active' AND owner_consent=1`), admin-login limiter, mail body, seed. Removes `/o/:token` logic (`getOwnerView`, token fns).
2. **M2 — screens in parallel worktrees** (on top of M1):
   - Worker A: owner screens B1, B1-1, verify, logout, B2, B3, B4 (+ `app/routes.ts` owner entries, owner nav shell, e2e for owner flows).
   - Worker B: admin pending queue, owner info + ★/memo on admin space/application pages, remove `/o` route + admin "건물주 링크" UI + tests, remove public admin entry points (home card, NavBar), `noindex` header + meta on `/admin*`, README "관리자 보안", admin-login 429.
3. **M3 — merge, e2e, checks, reviewer, report.**

## Shared interfaces (fixed by M1, UI code imports these)
- `requireOwner(request, env): Promise<Owner>` — redirects to `/owner` when logged out. `getOwner(request, env): Promise<Owner|null>`. `Owner = {id,email,name,phone,consentTermsAt,consentPrivacyAt}`; `ownerProfileComplete(owner)`.
- `requestLoginLink(db, env, request): Promise<{devLink:string|null}>` always neutral to the caller; `verifyLoginToken(db, token)` → `Owner|null`; `startOwnerSession(request, env, ownerId, to)`, `endOwnerSession`.
- `listOwnerSpaces(db, ownerId)` → cards with `stage`; `getOwnedSpace(db, ownerId, spaceId)` → `Space|null` (null ⇒ route throws 404); `createOwnerSpace`, `updatePendingSpace`.
- `listOwnerCandidates(db, ownerId, spaceId)` → `OwnerCandidate[]` (Candidate + `starred`, `memo`; no PII ever); `saveMark(db, ownerId, spaceId, applicationId, {starred?, memo?})` (checks ownership + that the application is in this space's shortlist).
- Admin: `listPendingSpaces`, `approveSpace`, `rejectSpace(reason)`, `getSpaceOwner`, `listMarksForSpace`, `getMarkForApplication`.
- Rate limit: `hitAndCheck(db, key, max, windowMs, now)`.

## Rulings (recorded in the report)
- Verify consumes the token on GET (spec); email-scanner prefetch is a deferred minor.
- Dev/e2e rate limits stay on; Playwright `globalSetup` clears `auth_attempts`.
- Photos: R2 keys stored as JSON in `spaces.photo_keys`; only the admin can view them.
- Owner session cookie holds only `ownerId`, signed with `SESSION_SECRET + ":owner"`, re-validated against the DB each request.
