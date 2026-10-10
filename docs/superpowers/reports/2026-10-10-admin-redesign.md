# 관리자 개편 · 숫자 티커 · 공실 대표 사진 — 구현 보고

브랜치 `feat/admin-redesign` (owner-accounts 작업 위에 쌓임, main 미병합). 스펙: `specs/2026-10-10-admin-redesign-design.md` §1–§5, 시안 `docs/mockup-v13.html`.

## 바뀐 것
- **숫자 티커** (`NumberTicker`, `ProgressBar`): 자리별 고정 폭 릴이 화면에 들어올 때 한 번 굴러감. SSR·JS 꺼짐·움직임 줄이기에서는 최종 숫자 그대로. 스크린리더에는 실제 값 한 번만. 고정 문구 “응답자 N명 중 M명이 이용 의향”은 일반 텍스트 유지. 적용: R1 숫자 띠, 건물주 “내 공실” 카드(후보 수, N/50 + 진행 막대), 관리자 할 일 카드(사이드 메뉴 숫자는 정적).
- **공실 대표 사진**: 마이그레이션 `0006_space_cover.sql`(`cover_key`, 첫 사진으로 백필). 공개 경로 `/media/space/:slug/cover`는 `active` + `owner_consent=1`일 때만 응답(그 외 전부 동일한 404), 건물주 전용 `/owner/spaces/:id/cover`, “사진 바꾸기” 페이지(`/owner/spaces/:id/photos`: 대표 고르기·사진 추가, 최대 5장). 아바타(사진 없으면 동 첫 글자)는 건물주 카드, 관리자 목록·헤더, `/find` 카드, R1 첫 화면.
- **관리자 개편**: 왼쪽 메뉴(PC)/상단 탭(모바일) 할 일·공실·신청·건물주. 할 일 카드 4개(승인 대기, 결과 메일 안 보냄, AI 평가 실패, 이번 달 매출 미기록)가 걸러진 목록으로 연결. `/admin/spaces`(검색·단계 칩·진행 막대), `/admin/applications`(상태 칩·다음 할 일 버튼), `/admin/owners`. 신청·공실 상세에 진행 단계 줄 + “다음 할 일” 상자, 부가 정보는 접힌 영역.
- **e2e 정리**: e2e가 만든 행은 `e2e·` 접두어, `e2e/global-teardown.ts`가 삭제(로컬 D1 한정, seed는 그대로 전체 초기화).

## 보는 법
`npm run db:migrate && npm run db:seed && npm run dev` → `/admin`(admin@ssulmo.local / ssulmo-dev), `/owner`(owner@ssulmo.local), `/r/seongsu-01`. 화면: `screens-admin-redesign/` (1280px: a1-todo, a2-spaces, a3-applications, a3-application-detail, n2-owner-cards, n1-report). 시드 공실에는 사진이 없어 아바타는 첫 글자로 보임.

## 테스트
- typecheck 통과, vitest **319개 통과** (시작 255)
- Playwright **29개 통과** (시작 21), 실행 후 로컬 DB는 시드 수(공실 6·신청 11·건물주 1)로 복귀.
- 새 e2e: A1 숫자 = DB, 카드 → 필터 목록, 공실 검색, A3 다음 할 일 상자, 대기 공실 커버 404, 건물주 목록, 건물주 대표 사진 변경, 움직임 줄이기 티커.

## 판단 기록 (틀렸을 때 비용)
1. 공개 커버 `Cache-Control: public, max-age=3600` 유지(스펙 지정). 동의 철회·사진 교체 후 최대 1시간 캐시에 남음. 비용: 낮음(1시간), 줄이려면 TTL만 수정.
2. 승인된 공실에 건물주가 사진을 추가/대표 변경하면 운영자 재검수 없이 공개됨(스펙 §2 “pending or active”에서 추가 가능). 부적절한 사진 위험이 있음 → **가장 중요한 후속 결정**(활성 공실 변경은 운영자 승인 대기로 두기).
3. R1 제목 “N건” 하이라이트는 시안(승인본)을 따름(ui.tsx의 “숫자에 하이라이트 금지”와 상충).
4. R1 숫자 띠는 기존 3개 지표 유지(시안의 % 지표 추가 안 함).
5. 사이드 메뉴 숫자는 정적(스펙).
6. `status=revenue` 필터는 W3가 추가(스펙 카드 링크용), 목록 칩에는 노출 안 함.

## 미룬 사소한 항목
- `addSpacePhotos` 동시 업로드 경쟁(읽고-쓰기), 실패 시 R2 고아 객체.
- 티커: 탭이 숨겨졌다 열릴 때 등 IntersectionObserver 미교차 시 0 유지 가능(스크린리더는 정상); 하이드레이션 직후 최종값→0→굴러감 깜빡임.
- teardown이 로컬 DB의 비시드 설문 응답·auth_attempts를 모두 지움, 실패 로그 무음.
- `listShortlist`를 공개 공실마다 호출(프로토타입 규모에서 무해).
- 이미지 content-type 화이트리스트 밖(구 업로드) 커버는 404.
- e2e가 올린 로컬 R2 파일은 정리 안 됨.

## 작업 중 사고
W2 브랜치가 `node_modules` 심볼릭 링크를 커밋해 병합 시 메인 node_modules가 깨졌고, 링크 제거 + `npm ci` + `.gitignore` 보강으로 복구함(코드 영향 없음).
