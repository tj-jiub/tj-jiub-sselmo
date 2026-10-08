// tests/spaces.test.ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/d1";
import { createSpace, getPublicSpace, getSpace, listPublicSpaces, listSpaces, parseSpaceForm, setOwnerConsent, slugTaken } from "~/lib/spaces.server";

const form = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

describe("parseSpaceForm", () => {
  it("accepts a valid space and reads the consent checkbox", () => {
    const r = parseSpaceForm(form({ name: "망원 1층", district: "마포구", neighborhood: "마포구 망원동", slug: "mangwon-01", ownerConsent: "on" }));
    expect(r).toEqual({ ok: true, value: { name: "망원 1층", district: "마포구", neighborhood: "마포구 망원동", slug: "mangwon-01", ownerConsent: true } });
  });
  it("rejects bad slugs and missing fields", () => {
    expect(parseSpaceForm(form({ name: "a", district: "마포구", neighborhood: "b", slug: "Bad Slug" })).ok).toBe(false);
    expect(parseSpaceForm(form({ name: "", district: "마포구", neighborhood: "b", slug: "ok-slug" })).ok).toBe(false);
  });
  it("requires a district ending with 구, at most 20 chars", () => {
    const base = { name: "a", neighborhood: "b", slug: "ok-slug" };
    expect(parseSpaceForm(form(base)).ok).toBe(false);
    expect(parseSpaceForm(form({ ...base, district: "" })).ok).toBe(false);
    expect(parseSpaceForm(form({ ...base, district: "망원동" })).ok).toBe(false);
    expect(parseSpaceForm(form({ ...base, district: `${"가".repeat(20)}구` })).ok).toBe(false);
    const ok = parseSpaceForm(form({ ...base, district: "  성동구 " }));
    expect(ok.ok && ok.value.district).toBe("성동구");
  });
});

describe("spaces repository", () => {
  it("hides spaces without owner consent from the public", async () => {
    const db = createTestDb();
    const id = await createSpace(db, { name: "A", district: "마포구", neighborhood: "망원동", slug: "a-space", ownerConsent: false, consentFileKey: null });
    expect(await getSpace(db, id)).not.toBeNull();
    expect(await getPublicSpace(db, "a-space")).toBeNull();
    expect(await getPublicSpace(db, "nope")).toBeNull();

    await setOwnerConsent(db, id, true);
    expect((await getPublicSpace(db, "a-space"))?.id).toBe(id);
  });

  it("detects taken slugs and lists spaces with response counts", async () => {
    const db = createTestDb();
    await createSpace(db, { name: "A", district: "마포구", neighborhood: "망원동", slug: "a-space", ownerConsent: true, consentFileKey: null });
    expect(await slugTaken(db, "a-space")).toBe(true);
    expect(await slugTaken(db, "b-space")).toBe(false);
    const spaces = await listSpaces(db);
    expect(spaces).toHaveLength(1);
    expect(spaces[0].response_count).toBe(0);
  });
});

it("stores the district on created spaces", async () => {
  const db = createTestDb();
  const id = await createSpace(db, { name: "A", district: "성동구", neighborhood: "성수동", slug: "a-space", ownerConsent: true, consentFileKey: null });
  expect((await getSpace(db, id))?.district).toBe("성동구");
});

describe("listPublicSpaces", () => {
  it("lists only consented spaces", async () => {
    const db = createTestDb();
    await createSpace(db, { name: "공개", district: "마포구", neighborhood: "n", slug: "open-one", ownerConsent: true, consentFileKey: null });
    await createSpace(db, { name: "비공개", district: "마포구", neighborhood: "n", slug: "hidden-one", ownerConsent: false, consentFileKey: null });
    expect((await listPublicSpaces(db)).map((s) => s.slug)).toEqual(["open-one"]);
  });
});
