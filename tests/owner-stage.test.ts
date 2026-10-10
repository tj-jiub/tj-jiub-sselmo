import { describe, expect, it } from "vitest";
import { stageView } from "../app/lib/owner-stage";

const base = { responseCount: 0, candidateCount: 0, rejectReason: null };

describe("stageView", () => {
  it("pending: waiting label, edit only", () => {
    const v = stageView({ ...base, stage: "pending" });
    expect(v.label).toBe("운영자 확인 대기");
    expect(v).toMatchObject({ big: null, canEdit: true, isLive: false, canViewCandidates: false });
  });
  it("collecting below 50 shows N/50 with the owner's own count", () => {
    const v = stageView({ ...base, stage: "collecting", responseCount: 32 });
    expect(v.big).toEqual({ value: "32/50", unit: "명" });
    expect(v).toMatchObject({ isLive: true, canViewCandidates: true, canEdit: false });
  });
  it("collecting at 50 or more shows N명 모였어요, not N/50", () => {
    expect(stageView({ ...base, stage: "collecting", responseCount: 50 }).big).toEqual({ value: "50", unit: "명 모였어요" });
    expect(stageView({ ...base, stage: "collecting", responseCount: 73 }).big).toEqual({ value: "73", unit: "명 모였어요" });
  });
  it("evaluated shows the candidate count", () => {
    const v = stageView({ ...base, stage: "evaluated", responseCount: 120, candidateCount: 5 });
    expect(v.label).toBe("후보 평가 완료");
    expect(v.big).toEqual({ value: "5", unit: "명의 후보" });
  });
  it("rejected carries the reason and nothing is live", () => {
    const v = stageView({ ...base, stage: "rejected", rejectReason: "주소 확인 불가" });
    expect(v.label).toBe("반려됨");
    expect(v.note).toContain("주소 확인 불가");
    expect(v).toMatchObject({ isLive: false, canViewCandidates: false, canEdit: false });
  });
  it("paused is not live", () => {
    const v = stageView({ ...base, stage: "paused" });
    expect(v.label).toBe("공개 일시 중지");
    expect(v.isLive).toBe(false);
  });
});
