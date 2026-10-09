// Evaluator implementations: `fake` (deterministic; tests, e2e, local dev) and
// `anthropic` (Messages API over fetch, no SDK). TODO(legal): sending plan text to
// Anthropic (US) is a 처리위탁·국외이전; the apply form collects a separate consent.
import { buildPrompt, type EvalInput } from "./ai-prompt.ts";
import { validateAiReport, type AiReport } from "./ai-report.ts";

export const ANTHROPIC_MODEL = "claude-sonnet-5-5";
export type Evaluation = { report: AiReport; model: string };
export interface Evaluator {
  name: string;
  evaluate(input: EvalInput): Promise<Evaluation>;
}

export const fakeEvaluator: Evaluator = {
  name: "fake",
  async evaluate(input) {
    const demand = input.survey.total > 0 ? input.estimate.respondents / input.survey.total : 0;
    // 40..95 depending on how many respondents picked the type; stable for equal input.
    const score = Math.max(0, Math.min(100, Math.round(40 + demand * 55 + (input.application.estCostManwon <= 5000 ? 3 : 0))));
    const verdict = score >= 75 ? "fit" : score >= 55 ? "improve" : "rethink";
    const t = input.application.businessType;
    const report: AiReport = {
      score,
      verdict,
      summary:
        verdict === "fit"
          ? `${t}은(는) 이 동네에서 수요가 확인된 업종이에요. 객단가와 영업 시간대를 설문과 맞추면 좋아요.`
          : verdict === "improve"
            ? `${t}은(는) 수요가 일부 확인돼요. 가격과 시간대를 설문 결과에 맞춰 보완하면 좋아요.`
            : `${t}은(는) 이 동네 설문에서 수요가 적게 나왔어요. 업종이나 위치 전략을 다시 생각해 보세요.`,
      strengths: demand >= 0.3 ? ["동네 수요와 일치", "초기 비용이 현실적"] : ["계획이 구체적"],
      risks: demand >= 0.3 ? ["계절에 따른 매출 변동"] : ["설문상 수요가 적음", "초기 비용 회수 기간"],
      sections: {
        demand_fit: `응답자 ${input.survey.total}명 중 ${input.estimate.respondents}명이 이 업종을 골랐어요.`,
        pricing: "설문의 1회 지출 분포와 계획한 가격대를 맞춰 보세요.",
        hours: "설문에서 방문이 많은 시간대에 영업 시간을 집중하는 게 좋아요.",
        cost_risk: `예상 창업 비용 ${input.application.estCostManwon}만원 대비 예상 월 순수익을 함께 확인하세요.`,
        suggestions: "작게 시작해 주민 반응을 보고 메뉴와 시간대를 조정해 보세요.",
      },
    };
    if (input.attachment?.kind === "ignored") report.notes = ["첨부 파일은 PDF가 아니어서 분석에서 제외했어요."];
    return { report, model: "fake" };
  },
};

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
const TIMEOUT_MS = 90_000;

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  const candidate = fenced ? fenced[1] : trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    throw new Error("model output is not valid JSON");
  }
}

export function createAnthropicEvaluator(apiKey: string, fetchImpl: FetchLike = fetch): Evaluator {
  return {
    name: "anthropic",
    async evaluate(input) {
      const { system, user } = buildPrompt(input);
      const content: unknown[] = [];
      if (input.attachment?.kind === "pdf") {
        content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: input.attachment.base64 } });
      }
      content.push({ type: "text", text: user });
      // Sonnet 5.5: no temperature/top_p, thinking left at its adaptive default.
      const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 8000, system, messages: [{ role: "user", content }] }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
      const body = (await res.json()) as { content?: Array<{ type: string; text?: string }>; stop_reason?: string };
      if (body.stop_reason === "refusal") throw new Error("model refusal");
      if (body.stop_reason === "max_tokens") throw new Error("model output cut off (max_tokens)");
      const text = (body.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
      const parsed = validateAiReport(extractJson(text));
      if (!parsed.ok) throw new Error(`invalid report: ${parsed.error}`);
      return { report: parsed.value, model: ANTHROPIC_MODEL };
    },
  };
}

export type EvaluatorEnv = { EVALUATOR?: string; ANTHROPIC_API_KEY?: string };
export function pickEvaluator(env: EvaluatorEnv): Evaluator {
  if (env.EVALUATOR === "fake" || !env.ANTHROPIC_API_KEY) return fakeEvaluator;
  return createAnthropicEvaluator(env.ANTHROPIC_API_KEY);
}
