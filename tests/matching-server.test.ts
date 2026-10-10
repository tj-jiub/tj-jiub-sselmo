import { describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/d1";
import { createSpace } from "~/lib/spaces.server";
import { saveResponse } from "~/lib/surveys.server";
import { loadPublicCoverSlugs, loadPublicTallies } from "~/lib/matching.server";
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

describe("loadPublicCoverSlugs", () => {
  it("lists only public spaces that have a cover or photos", async () => {
    const db = createTestDb();
    const mk = (slug: string, consent: boolean) =>
      createSpace(db, { name: slug, district: "성동구", neighborhood: "성동구 성수동", slug, ownerConsent: consent, consentFileKey: null });
    const withPhotos = await mk("with-photos", true);
    const withCover = await mk("with-cover", true);
    await mk("no-photo", true);
    const hidden = await mk("hidden-photo", false);
    await db.prepare("UPDATE spaces SET photo_keys = ? WHERE id = ?").bind(JSON.stringify(["a.jpg"]), withPhotos).run();
    await db.prepare("UPDATE spaces SET cover_key = ?, photo_keys = ? WHERE id = ?").bind("b.jpg", JSON.stringify(["a.jpg", "b.jpg"]), withCover).run();
    await db.prepare("UPDATE spaces SET photo_keys = ? WHERE id = ?").bind(JSON.stringify(["c.jpg"]), hidden).run();
    expect((await loadPublicCoverSlugs(db)).sort()).toEqual(["with-cover", "with-photos"]);
  });
});
