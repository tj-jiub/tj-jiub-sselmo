# 쓸모 건물주 계정 + 관리자 보안 결과 보고 (2026-10-10)

브랜치 `feat/owner-accounts` (main 미접촉). 설계 `docs/superpowers/specs/2026-10-10-owner-accounts-design.md`, 계획 `docs/superpowers/plans/2026-10-10-owner-accounts.md`, 시안 `docs/mockup-v12-owner.html`.

## 바뀐 것
- **건물주 로그인(§4)**: 이메일 매직링크. 토큰 32바이트 랜덤, DB에는 SHA-256만 저장, 15분·1회용(한 문장 `UPDATE … RETURNING`으로 원자적). 응답은 항상 같은 중립 문구. 별도 쿠키 `ssulmo_owner`(관리자와 이름·시크릿 분리, httpOnly·lax·https면 Secure), 매 요청 DB에서 건물주 재확인. 링크 응답은 `no-store` + `Referrer-Policy: no-referrer`.
- **화면**: B1 `/owner`, B1-1 `/owner/welcome`, `/owner/verify`, B2 `/owner/spaces`(공실당 단계 1개: 운영자 확인 대기 / 주민 의견 모으는 중 N/50명 / 후보 평가 완료 N명 / 반려됨 / 공개 일시 중지), B3 `/owner/spaces/new`(사진 ≤5장), 수정(대기 중만), B4 `/owner/spaces/:id/candidates`(★ + 메모 자동 저장 + 저장 버튼, 관심 필터), 로그아웃.
- **등록 → 승인**: 건물주 등록 공실은 `pending`(+동의 1). 모든 공개 경로는 `status='active' AND owner_consent=1`(`PUBLIC_SPACE_SQL`). 관리자 `/admin` 상단 "확인 대기 공실" 큐에서 승인/반려(사유는 건물주에게 표시).
- **개인정보**: 후보 목록은 명시 컬럼만, 로더 데이터에도 이름·이메일·계획·파일키·Space 전체 행 없음. 타인 공실/지원서는 404.
- **/o/:token 제거**(컬럼 `owner_token`은 유지, 미사용). 관련 테스트는 후보 페이지 데이터 테스트로 대체.
- **관리자**: 공간 페이지에 건물주 정보와 ★·메모(읽기 전용), 지원서 페이지에도 ★·메모. 공개 화면의 관리자 진입점 전부 제거(홈은 "건물주이신가요? 공실 등록하기"), `/admin*`·`/owner*`에 `X-Robots-Tag: noindex, nofollow` + meta. README에 "관리자 보안"(Cloudflare Access, 운영에서 `DEV_SHOW_LOGIN_LINK`·`EVALUATOR=fake` 금지).
- **제한(§6)**: 건물주 링크 요청 이메일당 3회/10분·IP당 20회/시간(초과해도 같은 중립 응답), 관리자 로그인 실패 IP당 5회/15분 → 429.

## 확인 방법
`npm ci && cp .dev.vars.example .dev.vars && npm run db:migrate && npm run db:seed && npm run dev` (Node 24).
- 건물주: `/owner` → 이메일 `owner@ssulmo.local` → "로그인 링크 받기". `.dev.vars`의 `DEV_SHOW_LOGIN_LINK=1`이면 링크가 화면에 표시됨(로컬/e2e 전용; 메일 설정이 없을 때만). 시드: 성수동 공실(★ + 메모 1개)과 확인 대기 공실 "금호동 역세권 1층".
- 관리자: `/admin/login` (admin@ssulmo.local / ssulmo-dev).

## 테스트
typecheck 통과 · vitest 255개(시작 182) · Playwright 21개(시작 10; 건물주 흐름·격리·관리자 승인·메모 공개·noindex 추가, /o 테스트 제거). Playwright는 설치된 Chromium 1194용 미커밋 로컬 설정으로 실행했고, 실행 때마다 `auth_attempts`를 비우는 globalSetup을 추가(제한이 dev에서도 실제로 동작하므로).

## 판단(Rulings)과 틀렸을 때 비용
1. 매직링크는 GET으로 소비(스펙 그대로). 틀리면: 메일 보안 스캐너가 링크를 먼저 열어 "쓸 수 없어요"가 뜸 → 다시 요청(낮음~중간, 아래 보류 1).
2. 사진은 `spaces.photo_keys`(JSON)에 R2 키 저장, 관리자만 열람. 틀리면 건물주에게 사진을 보여줄 때 별도 경로 필요(낮음).
3. 단계에 `paused`(동의 철회) 추가. 틀리면 문구만 바꾸면 됨(낮음).
4. 건물주 등록 공실은 대기 5곳까지. 틀리면 상한 조정(낮음).
5. 사진 Content-Type은 확장자로 고정, `nosniff` 추가(리뷰 반영).
6. 관리자 로그인 제한은 시도를 먼저 원자적으로 기록하고 성공하면 지움(병렬 요청으로 제한을 넘기는 것 방지).
7. `.data`(단일 fetch) URL도 noindex 대상에 포함.
8. 프로필(이름·연락처·동의) 미완성이면 공실 등록 전에 환영 화면으로 보냄.
9. 거절된 공실은 건물주가 수정·재제출할 수 없음(운영자 재승인만).

## 보류된 사소한 항목
1. 링크 소비를 POST 확인 버튼으로 바꾸기(스캐너·로그인 CSRF 대비) — 가장 먼저 권장.
2. 같은 이메일을 3회/10분 반복 요청해 본인 로그인을 막는 방해와 `+alias` 우회 메일 폭탄: 도메인/전체 상한, 최근 토큰 재사용 필요.
3. `hit()` 제한은 동시 요청에서 약간 넘길 수 있음(관리자 로그인과 달리 원자적이지 않음).
4. Workers Logs(`observability`)가 `?token=` URL을 기록할 수 있음(1회용·15분).
5. 전화번호 검증이 느슨함, 거절 공실 재제출 없음, 서버측 세션 폐기 없음(쿠키 14일).
6. 건물주 입력 텍스트가 AI 프롬프트에 들어감(운영자 확인 후·대기 중에만 수정 가능해 완화).
7. `MAX_PHOTOS`·`MEMO_MAX`가 UI에 하드코딩(공유 상수 파일로 이동 필요).
8. 카카오 로그인은 범위 밖.

## 열린 TODO(legal)
이용약관/개인정보 동의 문구, 소유자 확인 범위(등기부 확인 등), 건물주 후보 화면 안내 문구, 건물주 동의 형식. `grep -rn "TODO(legal)" app`.
