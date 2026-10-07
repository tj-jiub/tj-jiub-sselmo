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
    const r = parseSpaceForm(form({ name: "망원 1층", neighborhood: "마포구 망원동", slug: "mangwon-01", ownerConsent: "on" }));
    expect(r).toEqual({ ok: true, value: { name: "망원 1층", neighborhood: "마포구 망원동", slug: "mangwon-01", ownerConsent: true } });
  });
  it("rejects bad slugs and missing fields", () => {
    expect(parseSpaceForm(form({ name: "a", neighborhood: "b", slug: "Bad Slug" })).ok).toBe(false);
    expect(parseSpaceForm(form({ name: "", neighborhood: "b", slug: "ok-slug" })).ok).toBe(false);
  });
});

describe("spaces repository", () => {
  it("hides spaces without owner consent from the public", async () => {
    const db = createTestDb();
    const id = await createSpace(db, { name: "A", neighborhood: "망원동", slug: "a-space", ownerConsent: false, consentFileKey: null });
    expect(await getSpace(db, id)).not.toBeNull();
    expect(await getPublicSpace(db, "a-space")).toBeNull();
    expect(await getPublicSpace(db, "nope")).toBeNull();

    await setOwnerConsent(db, id, true);
    expect((await getPublicSpace(db, "a-space"))?.id).toBe(id);
  });

  it("detects taken slugs and lists spaces with response counts", async () => {
    const db = createTestDb();
    await createSpace(db, { name: "A", neighborhood: "망원동", slug: "a-space", ownerConsent: true, consentFileKey: null });
    expect(await slugTaken(db, "a-space")).toBe(true);
    expect(await slugTaken(db, "b-space")).toBe(false);
    const spaces = await listSpaces(db);
    expect(spaces).toHaveLength(1);
    expect(spaces[0].response_count).toBe(0);
  });
});

describe("listPublicSpaces", () => {
  it("lists only consented spaces", async () => {
    const db = createTestDb();
    await createSpace(db, { name: "공개", neighborhood: "n", slug: "open-one", ownerConsent: true, consentFileKey: null });
    await createSpace(db, { name: "비공개", neighborhood: "n", slug: "hidden-one", ownerConsent: false, consentFileKey: null });
    expect((await listPublicSpaces(db)).map((s) => s.slug)).toEqual(["open-one"]);
  });
});
