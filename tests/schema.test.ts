import { describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/d1";

describe("schema", () => {
  it("creates every table", async () => {
    const db = createTestDb();
    const { results } = await db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all<{ name: string }>();
    expect(results.map((r) => r.name)).toEqual([
      "applications",
      "broker_intros",
      "consulting_months",
      "educator_links",
      "spaces",
      "survey_contacts",
      "survey_responses",
    ]);
  });
});
