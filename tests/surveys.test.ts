// tests/surveys.test.ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/d1";
import { createSpace } from "~/lib/spaces.server";
import { hashDeviceId, listAnswers, listContacts, RESPONSE_COOLDOWN_MS, saveContact, saveResponse } from "~/lib/surveys.server";
import type { SurveyAnswers } from "~/lib/survey";

const answers: SurveyAnswers = {
  businessTypes: ["카페"],
  businessTypeOther: null,
  visitFrequency: "weekly1",
  spendRange: "5to10k",
  visitTime: "afternoon",
  respondentType: "resident",
};

async function setup() {
  const db = createTestDb();
  const a = await createSpace(db, { name: "A", district: "마포구", neighborhood: "n", slug: "a-space", ownerConsent: true, consentFileKey: null });
  const b = await createSpace(db, { name: "B", district: "마포구", neighborhood: "n", slug: "b-space", ownerConsent: true, consentFileKey: null });
  return { db, a, b };
}

describe("saveResponse", () => {
  it("allows one response per device per space per 24h", async () => {
    const { db, a, b } = await setup();
    const device = await hashDeviceId("device-1");
    const t0 = 1_700_000_000_000;
    expect(await saveResponse(db, a, device, answers, t0)).toBe("saved");
    expect(await saveResponse(db, a, device, answers, t0 + 1000)).toBe("cooldown");
    expect(await saveResponse(db, b, device, answers, t0 + 1000)).toBe("saved");
    expect(await saveResponse(db, a, await hashDeviceId("device-2"), answers, t0 + 1000)).toBe("saved");
    expect(await saveResponse(db, a, device, answers, t0 + RESPONSE_COOLDOWN_MS + 1)).toBe("saved");
    expect(await listAnswers(db, a)).toHaveLength(3);
  });

  it("saves only one of two simultaneous submissions from the same device", async () => {
    const { db, a } = await setup();
    const device = await hashDeviceId("double-tap");
    const results = await Promise.all([saveResponse(db, a, device, answers, 1000), saveResponse(db, a, device, answers, 1001)]);
    expect(results.sort()).toEqual(["cooldown", "saved"]);
    expect(await listAnswers(db, a)).toHaveLength(1);
  });

  it("hashes device ids rather than storing them", async () => {
    expect(await hashDeviceId("abc")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("stores contacts separately from answers", async () => {
    const { db, a } = await setup();
    await saveContact(db, a, "010-0000-0000");
    expect((await listContacts(db, a)).map((c) => c.contact)).toEqual(["010-0000-0000"]);
  });
});
