import { describe, expect, it } from "vitest";
import { buildPrompt, type EvalInput } from "~/lib/ai-prompt";

const input: EvalInput = {
  space: { name: "성수동 골목 1층 공실", neighborhood: "성동구 성수동", district: "성동구", locationNotes: "성수역 3번 출구 도보 4분" },
  survey: {
    total: 120,
    byType: [{ type: "아이스크림·디저트", count: 100 }],
    spend: [{ label: "5천~1만원", count: 40 }],
    visitTime: [{ label: "오후", count: 30 }],
    frequency: [{ label: "주 1~2회", count: 50 }],
    respondents: [{ label: "주민", count: 60 }],
  },
  estimate: { respondents: 100, revenue: { low: 11_000_000, high: 20_000_000 }, netProfit: { low: 2_000_000, high: 3_600_000 }, marginPct: 18, scaleFactor: 1 },
  application: { businessType: "젤라또 가게", planText: "동네 주민 대상 소형 젤라또 가게", estCostManwon: 4500 },
  attachment: null,
};

describe("buildPrompt", () => {
  it("contains the facts the model needs", () => {
    const { system, user } = buildPrompt(input);
    expect(user).toContain("성수동 골목 1층 공실");
    expect(user).toContain("성수역 3번 출구 도보 4분");
    expect(user).toContain("젤라또 가게");
    expect(user).toContain("동네 주민 대상 소형 젤라또 가게");
    expect(user).toContain("4500");
    expect(user).toContain("120");
    expect(user).toContain("아이스크림·디저트");
    expect(system).toContain("JSON");
    expect(system).toContain("demand_fit");
  });

  it("never includes applicant name or email, even when they leak in as extra properties", () => {
    const leaky = {
      ...input,
      application: { ...input.application, contactName: "김비밀", email: "secret@example.com" },
      contactName: "김비밀",
      email: "secret@example.com",
    } as unknown as EvalInput;
    const { system, user } = buildPrompt(leaky);
    for (const text of [system, user]) {
      expect(text).not.toContain("김비밀");
      expect(text).not.toContain("secret@example.com");
      expect(text).not.toContain("example.com");
    }
  });

  it("notes a non-PDF attachment instead of including it", () => {
    const { user } = buildPrompt({ ...input, attachment: { kind: "ignored", filename: null } });
    expect(user).toContain("PDF가 아니");
  });

  it("states the estimate as a range", () => {
    const { user } = buildPrompt(input);
    expect(user).toMatch(/1,100만/);
    expect(user).toMatch(/2,000만/);
  });
});
