import { execFileSync } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";
import { listConsultingMonths, listEducatorLinks } from "~/lib/consulting.server";
import { getOwnerView, listShortlist } from "~/lib/owner.server";
import { migratedSqlite, wrapSqlite } from "./helpers/d1";

let sqlite: ReturnType<typeof migratedSqlite>;
let db: D1Database;
const spaceId = (slug: string) => (sqlite.prepare("SELECT id FROM spaces WHERE slug = ?").get(slug) as { id: number }).id;

beforeAll(() => {
  const sql = execFileSync(process.execPath, ["scripts/seed.ts"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  sqlite = migratedSqlite();
  sqlite.exec(sql);
  db = wrapSqlite(sqlite);
}, 30_000);

describe("seed script", () => {
  it("gives mangwon-01 and seongsu-01 fixed owner tokens", async () => {
    expect(await getOwnerView(db, "o".repeat(32))).toMatchObject({ space: { name: "망원동 1층 코너 공실" } });
    expect(await getOwnerView(db, "p".repeat(32))).toMatchObject({ space: { name: "성수동 골목 1층 공실" } });
  });

  it("shows at most 5 anonymous candidates for seongsu-01 and some for mangwon-01", async () => {
    const seongsu = await listShortlist(db, spaceId("seongsu-01"));
    const mangwon = await listShortlist(db, spaceId("mangwon-01"));
    expect(seongsu).toHaveLength(5);
    expect(mangwon.length).toBeGreaterThanOrEqual(1);
    const text = JSON.stringify([...seongsu, ...mangwon]);
    expect(text).not.toContain("예시");
    expect(text).not.toContain("example.com");
    expect(seongsu.every((c) => c.score >= 60)).toBe(true);
  });

  it("seeds more than 5 passing, one failing and one below-60 application for seongsu-01", () => {
    const rows = sqlite
      .prepare("SELECT ai_status, ai_score FROM applications WHERE space_id = ?")
      .all(spaceId("seongsu-01")) as Array<{ ai_status: string; ai_score: number | null }>;
    expect(rows.filter((r) => r.ai_status === "done" && (r.ai_score ?? 0) >= 60).length).toBeGreaterThanOrEqual(6);
    expect(rows.filter((r) => r.ai_status === "done" && (r.ai_score ?? 100) < 60)).toHaveLength(1);
    expect(rows.filter((r) => r.ai_status === "failed")).toHaveLength(1);
  });

  it("records two consulting months and an educator link for the 쓸모 트랙 applicant", async () => {
    const app = sqlite.prepare("SELECT id, track FROM applications WHERE contact_name = '최예시'").get() as { id: number; track: string };
    expect(app.track).toBe("ssulmo");
    const months = await listConsultingMonths(db, app.id);
    expect(months.map((m) => [m.month, m.fee_krw])).toEqual([
      ["2026-12", 100000],
      ["2027-01", 0],
    ]);
    expect(await listEducatorLinks(db, app.id)).toEqual([
      expect.objectContaining({ organization: "성동구 창업지원센터", educator_name: "박멘토", connected_on: "2026-11-03" }),
    ]);
  });

  it("every application has the AI consent time, and 쓸모 트랙 ones the consulting consent", () => {
    const rows = sqlite.prepare("SELECT track, consent_ai_at, consent_consulting_at FROM applications").all() as Array<{
      track: string;
      consent_ai_at: number | null;
      consent_consulting_at: number | null;
    }>;
    expect(rows.length).toBeGreaterThanOrEqual(11);
    for (const r of rows) {
      expect(r.consent_ai_at).not.toBeNull();
      expect(r.consent_consulting_at !== null).toBe(r.track === "ssulmo");
    }
  });
});
