import { describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/d1";
import { createSpace } from "~/lib/spaces.server";

async function newApp(db: D1Database, spaceId: number, track: string, token: string) {
  return db
    .prepare(
      `INSERT INTO applications (space_id, result_token, business_type, plan_text, est_cost_manwon, contact_name, email,
        consent_privacy_at, consent_intro_terms_at, track, created_at) VALUES (?, ?, 'x', 'p', 1, 'n', 'e@x.kr', 1, 1, ?, 1)`,
    )
    .bind(spaceId, token, track)
    .run();
}

describe("migration 0004", () => {
  it("defaults: general track, pending AI status, scale factor 1", async () => {
    const db = createTestDb();
    const spaceId = await createSpace(db, { name: "A", district: "마포구", neighborhood: "n", slug: "a-space", ownerConsent: true, consentFileKey: null });
    const { meta } = await newApp(db, spaceId, "general", "t1");
    const row = await db.prepare("SELECT track, ai_status, ai_score FROM applications WHERE id = ?").bind(meta.last_row_id).first<Record<string, unknown>>();
    expect(row).toEqual({ track: "general", ai_status: "pending", ai_score: null });
    expect((await db.prepare("SELECT scale_factor, owner_token, margin_pct FROM spaces WHERE id = ?").bind(spaceId).first())).toEqual({
      scale_factor: 1,
      owner_token: null,
      margin_pct: null,
    });
  });

  it("rejects an unknown track and an out-of-range score", async () => {
    const db = createTestDb();
    const spaceId = await createSpace(db, { name: "A", district: "마포구", neighborhood: "n", slug: "a-space", ownerConsent: true, consentFileKey: null });
    await expect(newApp(db, spaceId, "vip", "t1")).rejects.toThrow();
    const { meta } = await newApp(db, spaceId, "general", "t2");
    await expect(db.prepare("UPDATE applications SET ai_score = 101 WHERE id = ?").bind(meta.last_row_id).run()).rejects.toThrow();
  });

  it("owner_token is unique", async () => {
    const db = createTestDb();
    const a = await createSpace(db, { name: "A", district: "마포구", neighborhood: "n", slug: "a-space", ownerConsent: true, consentFileKey: null });
    const b = await createSpace(db, { name: "B", district: "마포구", neighborhood: "n", slug: "b-space", ownerConsent: true, consentFileKey: null });
    await db.prepare("UPDATE spaces SET owner_token = 'dup' WHERE id = ?").bind(a).run();
    await expect(db.prepare("UPDATE spaces SET owner_token = 'dup' WHERE id = ?").bind(b).run()).rejects.toThrow();
  });

  it("consulting months only for the ssulmo track, one per month", async () => {
    const db = createTestDb();
    const spaceId = await createSpace(db, { name: "A", district: "마포구", neighborhood: "n", slug: "a-space", ownerConsent: true, consentFileKey: null });
    const general = (await newApp(db, spaceId, "general", "t1")).meta.last_row_id;
    const ssulmo = (await newApp(db, spaceId, "ssulmo", "t2")).meta.last_row_id;
    const ins = (id: number, month = "2026-12") =>
      db.prepare("INSERT INTO consulting_months (application_id, month, revenue_krw, profit_krw, fee_krw, created_at) VALUES (?, ?, 100, 10, 1, 1)").bind(id, month).run();
    await expect(ins(general)).rejects.toThrow(/ssulmo track/);
    await ins(ssulmo);
    await expect(ins(ssulmo)).rejects.toThrow();
    await ins(ssulmo, "2027-01");
  });
});
