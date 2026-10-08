// TODO(survey): question wording and option lists are provisional and will be
// finalised with the founder (e.g. adding "왜 이 자리가 오래 비어 있을까요?").
// Answers are stored as JSON, so changing questions needs no migration.

export type Option = { value: string; label: string };

export const BUSINESS_TYPES = [
  "카페",
  "베이커리",
  "아이스크림·디저트",
  "분식",
  "반찬가게",
  "세탁소",
  "꽃집",
  "공방",
  "스터디카페",
  "필라테스·요가",
] as const;
// Miller's law: 10 types are shown as 3 category cards of at most 5 each.
export const BUSINESS_CATEGORIES: ReadonlyArray<{ name: string; types: readonly (typeof BUSINESS_TYPES)[number][] }> = [
  { name: "먹거리", types: ["카페", "베이커리", "아이스크림·디저트", "분식", "반찬가게"] },
  { name: "생활", types: ["세탁소", "꽃집"] },
  { name: "배우기·운동", types: ["공방", "스터디카페", "필라테스·요가"] },
];
export function categoryOf(type: string): string | null {
  return BUSINESS_CATEGORIES.find((c) => (c.types as readonly string[]).includes(type))?.name ?? null;
}
export const OTHER = "기타";
export const MAX_BUSINESS_TYPES = 3;

export const VISIT_FREQUENCY: Option[] = [
  { value: "weekly3", label: "주 3회 이상" },
  { value: "weekly1", label: "주 1~2회" },
  { value: "monthly", label: "월 1~3회" },
  { value: "rarely", label: "가끔" },
];
export const SPEND_RANGE: Option[] = [
  { value: "lt5k", label: "5천원 미만" },
  { value: "5to10k", label: "5천~1만원" },
  { value: "10to20k", label: "1만~2만원" },
  { value: "gt20k", label: "2만원 이상" },
];
export const VISIT_TIME: Option[] = [
  { value: "morning", label: "오전" },
  { value: "lunch", label: "점심" },
  { value: "afternoon", label: "오후" },
  { value: "evening", label: "저녁" },
  { value: "night", label: "밤" },
];
export const RESPONDENT_TYPE: Option[] = [
  { value: "resident", label: "주민" },
  { value: "worker", label: "직장인" },
  { value: "student", label: "학생" },
  { value: "passerby", label: "지나가는 길" },
];

export type SurveyAnswers = {
  businessTypes: string[];
  businessTypeOther: string | null;
  visitFrequency: string;
  spendRange: string;
  visitTime: string;
  respondentType: string;
};

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function parseSurvey(form: FormData): Result<SurveyAnswers> {
  const picked = [...new Set(form.getAll("businessTypes").map(String))];
  const wantsOther = picked.includes(OTHER);
  const known = picked.filter((t) => (BUSINESS_TYPES as readonly string[]).includes(t));
  if (known.length + (wantsOther ? 1 : 0) !== picked.length) return { ok: false, error: "선택지를 다시 확인해 주세요." };
  if (picked.length < 1 || picked.length > MAX_BUSINESS_TYPES) return { ok: false, error: "업종은 1~3개 골라 주세요." };

  const otherText = String(form.get("businessTypeOther") ?? "").trim();
  if (wantsOther && !otherText) return { ok: false, error: "기타 업종을 적어 주세요." };
  if (otherText.length > 40) return { ok: false, error: "기타 업종은 40자 이내로 적어 주세요." };

  const pick = (name: string, options: Option[]) => {
    const v = String(form.get(name) ?? "");
    return options.some((o) => o.value === v) ? v : null;
  };
  const visitFrequency = pick("visitFrequency", VISIT_FREQUENCY);
  const spendRange = pick("spendRange", SPEND_RANGE);
  const visitTime = pick("visitTime", VISIT_TIME);
  const respondentType = pick("respondentType", RESPONDENT_TYPE);
  if (!visitFrequency || !spendRange || !visitTime || !respondentType) {
    return { ok: false, error: "모든 질문에 답해 주세요." };
  }

  return {
    ok: true,
    value: {
      businessTypes: known,
      businessTypeOther: wantsOther ? otherText : null,
      visitFrequency,
      spendRange,
      visitTime,
      respondentType,
    },
  };
}

// Contact is optional and consented to separately from the survey answers.
export function parseSurveyContact(form: FormData): Result<string | null> {
  const contact = String(form.get("contact") ?? "").trim();
  if (!contact) return { ok: true, value: null };
  if (contact.length > 100) return { ok: false, error: "연락처는 100자 이내로 적어 주세요." };
  if (form.get("contactConsent") !== "on") {
    return { ok: false, error: "연락처를 남기려면 개인정보 수집·이용에 동의해 주세요." };
  }
  return { ok: true, value: contact };
}
