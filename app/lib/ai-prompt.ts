// Builds the LLM prompt. The input type deliberately has no name or email field,
// and the builder copies fields explicitly (no spreading), so personal data
// cannot leak in even if a caller passes extra properties.
import { formatManwonRange } from "./money.ts";
import type { RevenueEstimate } from "./revenue.ts";

type Count = { label: string; count: number };
export type EvalInput = {
  space: { name: string; neighborhood: string; district: string | null; locationNotes: string | null };
  survey: {
    total: number;
    byType: Array<{ type: string; count: number }>;
    spend: Count[];
    visitTime: Count[];
    frequency: Count[];
    respondents: Count[];
  };
  estimate: Pick<RevenueEstimate, "respondents" | "revenue" | "netProfit" | "marginPct" | "scaleFactor">;
  application: { businessType: string; planText: string; estCostManwon: number };
  /** Only a PDF is sent to the model; other uploads are noted and ignored. */
  attachment: { kind: "pdf"; base64: string } | { kind: "ignored"; filename: string | null } | null;
};

export const SYSTEM_PROMPT = `당신은 동네 빈 상가에 들어올 창업 계획을 평가하는 사업성 심사 보조자입니다.
주어진 동네 수요조사 결과, 위치 정보, 예상 매출 추정치, 창업 계획을 바탕으로 평가하세요.
규칙:
- 한국어로, 쉬운 말로 씁니다. 매출이나 입점을 보장하는 표현은 쓰지 않습니다.
- 지원자의 이름이나 연락처는 제공되지 않습니다. 추측하지 마세요.
- 반드시 아래 형태의 JSON 객체 하나만 출력합니다. 설명 문장, 마크다운, 코드 펜스는 쓰지 않습니다.
{"score": 0~100 정수, "verdict": "fit" | "improve" | "rethink", "summary": "300자 이내 요약",
 "strengths": ["강점 최대 3개"], "risks": ["위험 최대 3개"],
 "sections": {"demand_fit": "수요 적합도", "pricing": "가격·객단가", "hours": "운영 시간대", "cost_risk": "비용 대비 위험", "suggestions": "개선 제안"}}
- verdict: fit(잘 맞아요, 대체로 75점 이상), improve(보완하면 좋아요), rethink(다시 생각해 보세요).`;

const lines = (items: Count[]) => items.map((i) => `${i.label} ${i.count}명`).join(", ");

export function buildPrompt(input: EvalInput): { system: string; user: string } {
  const { space, survey, estimate, application, attachment } = input;
  const parts: string[] = [
    `## 공간\n이름: ${space.name}\n동네: ${space.neighborhood}${space.district ? ` (${space.district})` : ""}\n위치 특징: ${space.locationNotes?.trim() || "(입력 없음)"}`,
    [
      "## 동네 수요조사",
      `응답자 ${survey.total}명`,
      `업종별 이용 의향: ${survey.byType.map((t) => `${t.type} ${t.count}명`).join(", ") || "(없음)"}`,
      `1회 지출: ${lines(survey.spend)}`,
      `방문 시간대: ${lines(survey.visitTime)}`,
      `방문 빈도: ${lines(survey.frequency)}`,
      `응답자 유형: ${lines(survey.respondents)}`,
    ].join("\n"),
    [
      `## 지원 업종(${application.businessType})의 예상치`,
      `이 업종을 고른 응답자 ${estimate.respondents}명 기준 (환산 배수 ${estimate.scaleFactor}, 순이익률 ${estimate.marginPct}% 가정)`,
      `예상 월매출 ${formatManwonRange(estimate.revenue)}, 예상 월 순수익 ${formatManwonRange(estimate.netProfit)}`,
    ].join("\n"),
    `## 창업 계획\n희망 업종: ${application.businessType}\n예상 창업 비용: ${application.estCostManwon}만원\n사업계획:\n${application.planText}`,
  ];
  if (attachment?.kind === "ignored") {
    parts.push("## 첨부 파일\n첨부 파일이 PDF가 아니어서 분석에서 제외했습니다. 리포트의 notes에 이 사실을 적어 주세요.");
  } else if (attachment?.kind === "pdf") {
    parts.push("## 첨부 파일\n사업계획서 PDF가 함께 첨부되어 있습니다.");
  }
  return { system: SYSTEM_PROMPT, user: parts.join("\n\n") };
}
