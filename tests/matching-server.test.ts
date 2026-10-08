import { describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/d1";
import { createSpace } from "~/lib/spaces.server";
import { saveResponse } from "~/lib/surveys.server";
import { loadPublicTallies } from "~/lib/matching.server";
import type { SurveyAnswers } from "~/lib/survey";

const ans = (types: string[]): SurveyAnswers => ({
  businessTypes: types,
  businessTypeOther: null,
  visitFrequency: "weekly1",
  spendRange: "5to10k",
  visitTime: "lunch",
  respondentType: "resident",
});

describe("loadPublicTallies", () => {
  it("tallies consented spaces only", async () => {
    const db = createTestDb();
    const open = await createSpace(db, { name: "공개", district: "성동구", neighborhood: "성동구 성수동", slug: "open-one", ownerConsent: true, consentFileKey: null });
    const hidden = await createSpace(db, { name: "비공개", district: "성동구", neighborhood: "성동구 성수동", slug: "hidden-one", ownerConsent: false, consentFileKey: null });
    await createSpace(db, { name: "빈 공간", district: "마포구", neighborhood: "마포구 망원동", slug: "empty-one", ownerConsent: true, consentFileKey: null });
    await saveResponse(db, open, "d1", ans(["카페", "분식"]));
    await saveResponse(db, open, "d2", ans(["카페"]));
    await saveResponse(db, hidden, "d3", ans(["카페"]));

    const tallies = await loadPublicTallies(db);
    expect(tallies.map((t) => t.slug).sort()).toEqual(["empty-one", "open-one"]);
    const o = tallies.find((t) => t.slug === "open-one")!;
    expect(o).toMatchObject({ name: "공개", district: "성동구", total: 2, counts: { 카페: 2, 분식: 1 } });
    expect(tallies.find((t) => t.slug === "empty-one")).toMatchObject({ total: 0, counts: {} });
  });
});
