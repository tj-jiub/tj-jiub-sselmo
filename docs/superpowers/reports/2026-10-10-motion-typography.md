# 쓸모 화면 개편 결과 보고 (2026-10-10)

브랜치 `feat/ai-screening` (main 미접촉). 설계 `docs/superpowers/specs/2026-10-10-motion-typography-design.md`, 계획 `docs/superpowers/plans/2026-10-10-motion-typography.md`, 시안 `docs/mockup-v11.html`·`mockup-v9-focus.html`.

## 바뀐 것
- **평가기 안전장치(§1)**: `EVALUATOR=fake`일 때만 가짜 평가기. 키가 없으면 `ai_status='failed'` + `ai_error`("ANTHROPIC_API_KEY is not set …"), 메일도 안 나감. `.dev.vars.example`은 `EVALUATOR=fake`, README에 운영 금지 경고.
- **이어지는 페이지(§2)**: R1 `/r/:slug`, O1 `/o/:token`, 홈 `/`을 시안 v11대로 재구성 — 마스크로 사라지는 히어로, 스크롤 타이핑 문장(어절 단위, #cfcdc8→잉크), 중앙 행이 켜지고 막대가 차는 목록, 쌓이는 sticky 카드(아래쪽 페이드), 통계 띠, CTA. 900ms 순차 등장, 휠 보간(0.075, ×0.7)은 이 페이지들에서만, `prefers-reduced-motion`이면 효과 없음. 고정 규칙(고정 문구, 50명 기준, 면책, 후보 ≤5·이름/이메일/계획 없음, 중개·AI 안내, 동의 404) 유지.
- **/find(§3)**: 질문 단계는 한 화면 하나(1.1초 전환, 업종은 질문 1화면 + 카테고리별 1화면), 결과는 이어지는 패턴.
- **가독성(§4)**: Noto Sans KR, 숫자만 Geist Mono(`.num`), 최소 15px(Tailwind xs/sm도 15px), 회색 #5f5d58, 하이라이트는 트림 그라디언트(화면당 1개), 신청·결과·설문·관리자는 일반 스크롤로 16px·섹션 묶기·헤어라인.
- **공유 계층**: `app/components/motion.tsx`(컴포넌트·훅), `app/lib/scroll-typing.ts`(순수 함수), `.cp-*` CSS. `html.mo`는 모션이 허용될 때만 켜지고, 5초 안에 하이드레이션이 안 되면 꺼져서 내용이 숨은 채 남지 않음.

## 확인 방법
`npm ci && cp .dev.vars.example .dev.vars && npm run db:migrate && npm run db:seed && npm run dev` (Node 24). `/`, `/r/seongsu-01`, `/r/yongsan-01`(50명 미만), `/o/` + `p`×32, `/find`.

## 테스트
typecheck 통과 · vitest 182개(시작 171) · Playwright 10개(시작 8; R1 문구·면책, 50명 미만 숨김 추가; O1 이름/이메일 없음 테스트는 기존). 마크업이 바뀐 곳은 선택자만 정직하게 수정(O1 `article`→`.cp-row`, 스크롤 문장 sr-only 복사본 때문에 `.first()`).
Playwright는 Chromium 1243을 못 받아 미커밋 로컬 설정(`pw.local.config.ts`, 1194)으로 실행.

## 스크린샷 (390px / 1280px, 움직임 줄이기 상태 전체 페이지)
`docs/superpowers/reports/screens-2026-10-10/` : `r1-*`, `o1-*`, `home-*`, `find-*`(첫 질문), `find-results-*`.

## 판단(Rulings)과 틀렸을 때 비용
1. 키가 없으면 실패 처리(가짜로 대체 안 함). 틀리면: 키 설정 전 신청이 `failed`로 쌓임 → 관리자 재평가로 복구(낮음).
2. O1은 "3장 후 더 보기"를 없애고 후보 ≤5를 모두 표시(연속 목록 패턴). 틀리면 모바일 길이만 늘어남(낮음).
3. 업종 선택 단계는 한 화면에 카테고리 전부 대신 질문 1화면 + 카테고리 3화면(중첩 스크롤·휠 막힘 방지). 틀리면 단계가 다소 길어짐(낮음).
4. 폼·관리자는 한 화면 고정 없이 일반 스크롤(스펙 §4). 
5. 고정 내비 뒤에 흰 그라디언트 배경 추가(시안엔 없음, 본문과 겹침 방지). 틀리면 히어로 상단 색이 약간 달라 보임(낮음).
6. R1 통계 띠는 실제 숫자만(응답 수·업종 수·1위 업종 응답 수) — 시안의 "30초", "0원" 같은 값은 근거가 없어 쓰지 않음.

## 보류된 사소한 항목
- `/find` 질문 화면에는 사이트 내비가 없음(← 이전 링크만).
- 히어로 마스크 하단 62% 이후는 짧은 화면에서 리드 문장이 흐려질 수 있음.
- 흐린 행(opacity .32)의 링크는 hover/focus 시에만 진해짐.
- 트랙패드 관성에서 질문 화면이 한 번 더 넘어갈 수 있음(쿨다운 600ms로 완화).
- 이전 보고서의 보류 항목(Referrer-Policy 등)은 그대로.
- 리뷰어 지적 중 Critical 없음, Important 5건·Minor 일부(6,7,9,10,11,13) 수정.
