// Fixed copy and policy values. Anything marked TODO(legal) must be reviewed
// before real users see it.

export const CONSENTS = {
  // TODO(legal): purpose, items, retention period and destruction policy need review.
  surveyContact: {
    label: "개인정보 수집·이용 동의",
    detail: "수집 항목: 연락처 · 목적: 이 자리에 가게가 생기면 소식 전달 · 보유 기간: 목적 달성 후 즉시 파기",
  },
  // TODO(legal): purpose, items, retention period and destruction policy need review.
  privacy: {
    label: "개인정보 수집·이용 동의",
    detail: "수집 항목: 이름, 이메일, 사업계획 · 목적: 신청 검토 및 결과 안내 · 보유 기간: 검토 완료 후 1년",
  },
  // TODO(legal): overseas transfer / processing-delegation wording (Anthropic, US) needs review.
  ai: {
    label: "AI 분석 처리위탁·국외이전 동의",
    detail: "사업계획에 적은 내용(첨부 PDF 포함)을 AI(Anthropic, 미국)로 분석해요. 이름과 이메일 항목은 보내지 않지만, 사업계획 글에 직접 적은 개인정보는 그대로 전달돼요.",
  },
  // TODO(legal): consulting terms (fee structure, separation from the lease) need review.
  consulting: {
    label: "쓸모 트랙 컨설팅 약관 동의",
    detail: "임대차 계약과 별개예요. 손해 본 달은 0원, 번 달만 매출의 1%. 일반 신청을 고르면 해당하지 않아요.",
  },
  // TODO(legal): confirm broker-introduction consent may be collected on this form.
  introTerms: {
    label: "중개사 소개는 별도 동의가 있을 때만 이뤄져요",
    detail: "아래 [선택] 항목에 동의하지 않으면 어떤 중개사에게도 신청 정보가 전달되지 않아요.",
  },
  brokerIntroOptIn: {
    label: "공인중개사 소개를 원해요",
    detail: "동의하면 이 공간을 담당하는 공인중개사에게 이름과 이메일을 전달할 수 있어요. 언제든 철회할 수 있어요.",
  },
} as const;
