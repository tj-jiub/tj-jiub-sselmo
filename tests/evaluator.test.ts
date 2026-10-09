import { describe, expect, it } from "vitest";
import { createAnthropicEvaluator, fakeEvaluator, pickEvaluator } from "~/lib/evaluator.server";
import { validateAiReport } from "~/lib/ai-report";
import type { EvalInput } from "~/lib/ai-prompt";

const input: EvalInput = {
  space: { name: "S", neighborhood: "성동구 성수동", district: "성동구", locationNotes: null },
  survey: { total: 120, byType: [{ type: "아이스크림·디저트", count: 100 }], spend: [], visitTime: [], frequency: [], respondents: [] },
  estimate: { respondents: 100, revenue: { low: 11_000_000, high: 20_000_000 }, netProfit: { low: 2_000_000, high: 3_600_000 }, marginPct: 18, scaleFactor: 1 },
  application: { businessType: "아이스크림·디저트", planText: "plan", estCostManwon: 4500 },
  attachment: null,
};
const goodJson = {
  score: 80, verdict: "fit", summary: "좋아요", strengths: ["a"], risks: ["b"],
  sections: { demand_fit: "1", pricing: "2", hours: "3", cost_risk: "4", suggestions: "5" },
};
const okResponse = (text: string) =>
  new Response(JSON.stringify({ content: [{ type: "thinking", thinking: "" }, { type: "text", text }], stop_reason: "end_turn" }), { status: 200 });

describe("fakeEvaluator", () => {
  it("is deterministic and valid", async () => {
    const a = await fakeEvaluator.evaluate(input);
    const b = await fakeEvaluator.evaluate(input);
    expect(a).toEqual(b);
    expect(validateAiReport(a.report).ok).toBe(true);
    expect(a.model).toBe("fake");
  });
  it("scores a top-demand type higher than a type nobody picked", async () => {
    const hi = await fakeEvaluator.evaluate(input);
    const lo = await fakeEvaluator.evaluate({ ...input, estimate: { ...input.estimate, respondents: 0 } });
    expect(hi.report.score).toBeGreaterThan(lo.report.score);
  });
});

describe("anthropic evaluator", () => {
  it("posts to the Messages API with the key and parses the JSON", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const ev = createAnthropicEvaluator("sk-test", async (url, init) => {
      seen = { url: String(url), init: init! };
      return okResponse(JSON.stringify(goodJson));
    });
    const out = await ev.evaluate(input);
    expect(out.report.score).toBe(80);
    expect(out.model).toBe("claude-sonnet-5-5");
    expect(seen!.url).toBe("https://api.anthropic.com/v1/messages");
    const headers = seen!.init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-test");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    const body = JSON.parse(String(seen!.init.body));
    expect(body.model).toBe("claude-sonnet-5-5");
    expect(JSON.stringify(body)).not.toContain("example.com");
    expect(body.messages[0].role).toBe("user");
  });
  it("accepts JSON wrapped in a code fence", async () => {
    const ev = createAnthropicEvaluator("k", async () => okResponse("```json\n" + JSON.stringify(goodJson) + "\n```"));
    expect((await ev.evaluate(input)).report.verdict).toBe("fit");
  });
  it("attaches a PDF as a document block", async () => {
    let body: any;
    const ev = createAnthropicEvaluator("k", async (_u, init) => {
      body = JSON.parse(String(init!.body));
      return okResponse(JSON.stringify(goodJson));
    });
    await ev.evaluate({ ...input, attachment: { kind: "pdf", base64: "QUJD" } });
    expect(body.messages[0].content[0]).toMatchObject({ type: "document", source: { type: "base64", media_type: "application/pdf", data: "QUJD" } });
  });
  it("throws on HTTP errors, invalid JSON and invalid reports", async () => {
    await expect(createAnthropicEvaluator("k", async () => new Response("no", { status: 500 })).evaluate(input)).rejects.toThrow(/500/);
    await expect(createAnthropicEvaluator("k", async () => okResponse("not json")).evaluate(input)).rejects.toThrow(/JSON/);
    await expect(createAnthropicEvaluator("k", async () => okResponse(JSON.stringify({ ...goodJson, score: 500 }))).evaluate(input)).rejects.toThrow(/score/);
    const refusal = new Response(JSON.stringify({ content: [], stop_reason: "refusal" }), { status: 200 });
    await expect(createAnthropicEvaluator("k", async () => refusal).evaluate(input)).rejects.toThrow(/refusal/);
  });
});

describe("pickEvaluator", () => {
  it("uses the fake when asked or when no key is set", () => {
    expect(pickEvaluator({ EVALUATOR: "fake", ANTHROPIC_API_KEY: "k" }).name).toBe("fake");
    expect(pickEvaluator({}).name).toBe("fake");
    expect(pickEvaluator({ ANTHROPIC_API_KEY: "" }).name).toBe("fake");
    expect(pickEvaluator({ ANTHROPIC_API_KEY: "k" }).name).toBe("anthropic");
  });
});
