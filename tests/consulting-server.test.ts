import { describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/d1";
import { createSpace } from "~/lib/spaces.server";
import { addConsultingMonth, addEducatorLink, listConsultingMonths, listEducatorLinks } from "~/lib/consulting.server";

async function setup() {
  const db = createTestDb();
  const spaceId = await createSpace(db, { name: "A", district: "마포구", neighborhood: "n", slug: "a-space", ownerConsent: true, consentFileKey: null });
  const mk = async (track: string, token: string) =>
    (await db.prepare(`INSERT INTO applications (space_id, result_token, business_type, plan_text, est_cost_manwon, contact_name, email, consent_privacy_at, consent_intro_terms_at, track, created_at) VALUES (?, ?, 'x', 'p', 1, 'n', 'e@x.kr', 1, 1, ?, 1)`).bind(spaceId, token, track).run()).meta.last_row_id;
  return { db, ssulmo: await mk("ssulmo", "t1"), general: await mk("general", "t2") };
}

describe("consulting months", () => {
  it("records a profit month with 1% fee and a loss month with 0", async () => {
    const { db, ssulmo } = await setup();
    expect(await addConsultingMonth(db, ssulmo, { month: "2026-12", revenueKrw: 10_000_000, profitKrw: 1_800_000, feeKrw: 100_000 }, 1)).toBe("saved");
    expect(await addConsultingMonth(db, ssulmo, { month: "2027-01", revenueKrw: 6_200_000, profitKrw: -400_000, feeKrw: 0 }, 2)).toBe("saved");
    const rows = await listConsultingMonths(db, ssulmo);
    expect(rows.map((r) => [r.month, r.fee_krw])).toEqual([["2026-12", 100_000], ["2027-01", 0]]);
  });
  it("rejects duplicates and non-쓸모-track applications with a friendly code", async () => {
    const { db, ssulmo, general } = await setup();
    const m = { month: "2026-12", revenueKrw: 1, profitKrw: 1, feeKrw: 0 };
    await addConsultingMonth(db, ssulmo, m);
    expect(await addConsultingMonth(db, ssulmo, m)).toBe("duplicate");
    expect(await addConsultingMonth(db, general, m)).toBe("not-ssulmo");
  });
  it("records the educator connection", async () => {
    const { db, ssulmo } = await setup();
    await addEducatorLink(db, ssulmo, { organization: "센터", educatorName: "박멘토", connectedOn: "2026-11-03" }, 1);
    expect(await listEducatorLinks(db, ssulmo)).toMatchObject([{ organization: "센터", educator_name: "박멘토", connected_on: "2026-11-03" }]);
  });
});
