import { describe, expect, it } from "vitest";
import { APPLICATION_STEPS, applicationStage, nextAction, spaceStage } from "~/lib/admin-stage";

const sp = (o: Partial<Parameters<typeof spaceStage>[0]> = {}) =>
  spaceStage({ status: "active", owner_consent: 1, response_count: 0, candidate_count: 0, ...o });

describe("spaceStage", () => {
  it("pending / rejected / private", () => {
    expect(sp({ status: "pending" })).toMatchObject({ key: "pending", label: "승인 대기", progress: null });
    expect(sp({ status: "rejected" })).toMatchObject({ key: "rejected", label: "반려", progress: null });
    expect(sp({ owner_consent: 0 })).toMatchObject({ key: "private", label: "비공개", progress: null });
  });
  it("collecting shows progress out of 50 in plain words", () => {
    expect(sp({ response_count: 12 })).toEqual({
      key: "collecting", label: "의견 모으는 중", progress: { value: 12, max: 50 }, detail: "주민 의견 12 / 50명",
    });
  });
  it("caps progress at max", () => {
    expect(sp({ response_count: 70 }).progress).toEqual({ value: 50, max: 50 });
  });
  it("ready when there are candidates", () => {
    expect(sp({ response_count: 60, candidate_count: 3 })).toMatchObject({ key: "ready", label: "후보 준비됨", detail: "후보 3명" });
  });
  it("uses no abbreviations", () => {
    expect(sp({ status: "rejected" }).detail).not.toMatch(/·/);
  });
});

const ap = (o: Partial<Parameters<typeof applicationStage>[0]> = {}) =>
  applicationStage({ ai_status: "done", result_mailed_at: null, ...o });

describe("applicationStage", () => {
  it("maps state to key, label and step", () => {
    expect(ap({ ai_status: "pending" })).toEqual({ key: "evaluating", label: "평가 중", stepIndex: 1 });
    expect(ap({ ai_status: "failed" })).toEqual({ key: "failed", label: "실패", stepIndex: 1 });
    expect(ap()).toEqual({ key: "mail", label: "메일 보낼 차례", stepIndex: 2 });
    expect(ap({ result_mailed_at: 5 })).toEqual({ key: "owner-review", label: "건물주 검토 중", stepIndex: 3 });
    expect(ap({ result_mailed_at: 5, has_broker_intro: true })).toEqual({ key: "contract", label: "계약 단계", stepIndex: 4 });
  });
  it("has five steps", () => {
    expect(APPLICATION_STEPS).toEqual(["신청", "AI 평가", "결과 메일", "건물주 검토", "계약 (공인중개사)"]);
  });
});

describe("nextAction", () => {
  it("approves pending spaces only", () => {
    expect(nextAction({ kind: "space", status: "pending", owner_consent: 1, response_count: 0, candidate_count: 0 })?.title).toBe("공실 승인하기");
    expect(nextAction({ kind: "space", status: "active", owner_consent: 1, response_count: 0, candidate_count: 0 })).toBeNull();
  });
  const app = (o: Record<string, unknown> = {}) =>
    ({ kind: "application", ai_status: "done", result_mailed_at: null, track: "general", consent_consulting_at: null, has_month_this_month: false, ...o }) as Parameters<typeof nextAction>[0];
  it("failed -> re-evaluate", () => {
    expect(nextAction(app({ ai_status: "failed" }))?.title).toBe("재평가하기");
  });
  it("evaluating -> nothing to do", () => {
    expect(nextAction(app({ ai_status: "pending" }))).toBeNull();
  });
  it("not mailed -> send mail", () => {
    expect(nextAction(app())?.title).toBe("결과 메일 보내기");
  });
  it("ssulmo with consulting and no month row -> record revenue", () => {
    expect(nextAction(app({ result_mailed_at: 1, track: "ssulmo", consent_consulting_at: 2 }))?.title).toBe("이번 달 매출 기록하기");
    expect(nextAction(app({ result_mailed_at: 1, track: "ssulmo", consent_consulting_at: 2, has_month_this_month: true }))?.title).toBe("건물주 검토를 기다려요");
  });
  it("mailed general -> wait for owner", () => {
    expect(nextAction(app({ result_mailed_at: 1 }))?.title).toBe("건물주 검토를 기다려요");
  });
  it("contract stage -> null", () => {
    expect(nextAction(app({ result_mailed_at: 1, has_broker_intro: true }))).toBeNull();
  });
});
