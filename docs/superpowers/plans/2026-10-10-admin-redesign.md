# Plan: number ticker, space cover photo, admin redesign

Spec: `docs/superpowers/specs/2026-10-10-admin-redesign-design.md` (§1–§5). Screens: `docs/mockup-v13.html`.
Branch `feat/admin-redesign`; three workers in git worktrees, merged by the lead. Node 24 required.

## Phase 0 (lead, done first): shared foundation
- `migrations/0006_space_cover.sql` (`spaces.cover_key`, backfilled from the first of `photo_keys`).
- `Space.cover_key`, `OwnerSpaceCard.hasCover` (stub `false`, W1 fills it).
- `app/lib/cover.ts` (pure): `publicCoverUrl(slug)`, `ownerCoverUrl(id)`, `adminFileUrl(key)`, `avatarInitial(name, neighborhood)`, `resolveCoverKey(photoKeys, coverKey)`.
- `app/components/SpaceAvatar.tsx`: `<SpaceAvatar src name neighborhood size={40|56|88}/>` (src null → initial tile).
- Route table already contains every new route, each a stub file the owning worker replaces:
  `media/space/:slug/cover` (space-cover), `owner/spaces/:id/cover` (owner-space-cover), `owner/spaces/:id/photos` (owner-space-photos),
  `admin/spaces` (admin-spaces), `admin/applications` (admin-applications), `admin/owners` (admin-owners).

## Shared contract for the admin helpers (W1 implements, W3 consumes)
`app/lib/admin-stage.ts` (pure, no server imports, unit tested):
- `spaceStage(s: { status; owner_consent; response_count; candidate_count }) → { key: "pending"|"collecting"|"ready"|"rejected"|"private"; label: string; progress: { value: number; max: number } | null; detail: string }`
  labels: 승인 대기 / 의견 모으는 중 (progress = responses/50, detail "주민 의견 N / 50명") / 후보 준비됨 (detail "후보 N명") / 반려 / 비공개.
- `applicationStage(a: { ai_status; result_mailed_at; has_broker_intro?: boolean }) → { key: "evaluating"|"failed"|"mail"|"owner-review"|"contract"; label: string; stepIndex: 0..4 }`
  labels: 평가 중 / 실패 / 메일 보낼 차례 / 건물주 검토 중 / 계약 단계. `APPLICATION_STEPS = ["신청","AI 평가","결과 메일","건물주 검토","계약 (공인중개사)"]`.
- `nextAction(entity) → { key: string; title: string; hint: string } | null` for `{kind:"space",…}` (approve pending space → "공실 승인하기"; otherwise null) and
  `{kind:"application", …}` (failed → 재평가하기; mail not sent → 결과 메일 보내기; ssulmo track with active consulting and no row this month → 이번 달 매출 기록하기; else 건물주 검토를 기다려요/null).
- `app/lib/admin-todo.server.ts`: `adminTodoCounts(db, now) → { pendingSpaces, unmailed, aiFailed, revenueMissing, total }` and `adminNavCounts(db, now) → { todo, spaces, applications, owners }`.
  Definitions: pendingSpaces = status 'pending'; unmailed = ai_status 'done' AND result_mailed_at NULL; aiFailed = ai_status 'failed';
  revenueMissing = track 'ssulmo' AND consent_consulting_at NOT NULL AND no consulting_months row for the KST month of `now` (format YYYY-MM, same as consulting.ts).
  Also `listAdminSpaces(db, {status?, q?})` and `listAdminApplications(db, {status?})` returning rows with the fields the lists need (cover_key, owner name when present, response_count, candidate_count; application rows with space cover/neighborhood).

## Workers
- **W1 (branch `feat/admin-w1`)** — TDD. Cover server logic: `space-cover` public route (200 only for active + owner_consent=1 + image content type, `Cache-Control: public, max-age=3600`, `nosniff`; everything else 404), `owner-space-cover` (owner-isolated, 404 for others), `owner-space-photos` page ("사진 바꾸기": pick cover among own photos, add photos while pending/active, max 5 total, uses `checkPhotos`/`storeUpload`/`photoContentType`), `createOwnerSpace` sets cover_key, `listOwnerSpaces` fills `hasCover`; `admin-stage.ts`, `admin-todo.server.ts` with the contract above.
- **W2 (branch `feat/admin-w2`)** — `NumberTicker` + `digitsOf` (tested), CSS, applied on R1 stats band, home stats, owner "내 공실" cards (candidates, N/50, plus progress bar); `SpaceAvatar` on owner cards (src `ownerCoverUrl(id)` when `hasCover`), `/find` result cards and R1 hero (public cover URL only for public spaces that have a cover); owner "사진 바꾸기" link on the card to `/owner/spaces/:id/photos`.
- **W3 (branch `feat/admin-w3`)** — admin shell (side menu PC / tabs < 1024px, counts via `adminNavCounts`), A1 할 일, A2 공실 list, A3 신청 list + detail restructure (progress line, 다음 할 일 box, collapsible secondary sections), space detail header/next action, owners list, e2e data hygiene (name prefix `e2e·`, global teardown), e2e specs per spec §5.
  W3 starts with the shell, owners list and hygiene (independent) and merges `feat/admin-w1` (admin-stage / admin-todo) before building A1–A3.

## Rulings made up front
- Cover URL per viewer: public → `/media/space/:slug/cover`; owner → `/owner/spaces/:id/cover`; admin → `/admin/files/<key>` (Content-Disposition attachment is wrong for `<img>`? browsers still render inline images from attachment responses; W1 adds a `?inline=1`-free fix: admin cover uses `/admin/files/<key>` unchanged unless the browser refuses, then serve inline for image types).
- Ticker never touches the fixed demand phrase; side-menu counts are static.

## Finish
typecheck + vitest + playwright green → fresh reviewer subagent on the whole diff → report `docs/superpowers/reports/2026-10-10-admin-redesign.md` (Korean) with 1280px screenshots → push → one notification.
