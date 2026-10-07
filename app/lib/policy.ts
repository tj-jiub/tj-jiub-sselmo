// Fixed copy and policy values. Anything marked TODO(legal) must be reviewed
// before real users see it.

export const FEE_SERVICE_NAME = "사업계획서 검토 및 피드백 서비스";

// Paid written feedback, requested from the result page. Applying is free.
export const FEE_AMOUNT_KRW = 10000;
// TODO(legal): placeholder account — confirm before launch.
export const BANK_TRANSFER = { bank: "OO은행", account: "000-000000-00-000", holder: "썰모" };

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
  // Collected on the result page when paid feedback is requested.
  // TODO(legal): confirm this wording fully covers the fee's nature.
  feeTerms: {
    label: `${FEE_SERVICE_NAME} 이용료예요`,
    detail: "임대차 계약 체결과 관계없으며, 입점이나 계약을 보장하지 않아요.",
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
