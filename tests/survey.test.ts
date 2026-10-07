// tests/survey.test.ts
import { describe, expect, it } from "vitest";
import { parseSurvey, parseSurveyContact } from "~/lib/survey";

const base = { visitFrequency: "weekly1", spendRange: "5to10k", visitTime: "afternoon", respondentType: "resident" };

function form(types: string[], extra: Record<string, string> = {}) {
  const f = new FormData();
  for (const t of types) f.append("businessTypes", t);
  for (const [k, v] of Object.entries({ ...base, ...extra })) f.set(k, v);
  return f;
}

describe("parseSurvey", () => {
  it("accepts 1-3 business types", () => {
    const r = parseSurvey(form(["카페", "베이커리"]));
    expect(r).toEqual({ ok: true, value: { businessTypes: ["카페", "베이커리"], businessTypeOther: null, ...base } });
  });
  it("counts 기타 toward the limit and requires its text", () => {
    expect(parseSurvey(form(["카페", "기타"])).ok).toBe(false);
    const r = parseSurvey(form(["카페", "기타"], { businessTypeOther: " 아이스크림집 " }));
    expect(r.ok && r.value).toMatchObject({ businessTypes: ["카페"], businessTypeOther: "아이스크림집" });
    expect(parseSurvey(form(["카페", "베이커리", "분식", "기타"], { businessTypeOther: "x" })).ok).toBe(false);
  });
  it("rejects zero types, unknown values and missing answers", () => {
    expect(parseSurvey(form([])).ok).toBe(false);
    expect(parseSurvey(form(["없는업종"])).ok).toBe(false);
    expect(parseSurvey(form(["카페"], { visitTime: "" })).ok).toBe(false);
    expect(parseSurvey(form(["카페"], { respondentType: "alien" })).ok).toBe(false);
  });
});

describe("parseSurveyContact", () => {
  const f = (contact: string, consent: boolean) => {
    const d = new FormData();
    d.set("contact", contact);
    if (consent) d.set("contactConsent", "on");
    return d;
  };
  it("is optional", () => expect(parseSurveyContact(f("", false))).toEqual({ ok: true, value: null }));
  it("needs separate consent when given", () => {
    expect(parseSurveyContact(f("010-1234-5678", false)).ok).toBe(false);
    expect(parseSurveyContact(f("010-1234-5678", true))).toEqual({ ok: true, value: "010-1234-5678" });
  });
});
