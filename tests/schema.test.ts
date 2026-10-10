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
      "auth_attempts",
      "broker_intros",
      "candidate_marks",
      "consulting_months",
      "educator_links",
      "owner_login_tokens",
      "owners",
      "spaces",
      "survey_contacts",
      "survey_responses",
    ]);
  });
});
