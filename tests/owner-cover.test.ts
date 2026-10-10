import { describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/d1";
import { upsertOwner } from "~/lib/owner-auth.server";
import { addSpacePhotos, createOwnerSpace, getOwnedSpace, listOwnerSpaces, setCoverKey } from "~/lib/owner-spaces.server";
import { ownerPhotoResponse, publicCoverResponse } from "~/lib/cover.server";
import { MAX_PHOTOS } from "~/lib/uploads.server";

const input = (photoKeys: string[]) => ({ name: "공간", district: "성동구", neighborhood: "성동구 성수동", locationNotes: null, photoKeys });

async function setup(photos = ["owner-photos/a.png", "owner-photos/b.jpg"]) {
  const db = createTestDb();
  const owner = await upsertOwner(db, "o@x.kr");
  const other = await upsertOwner(db, "p@x.kr");
  const id = await createOwnerSpace(db, owner.id, input(photos));
  return { db, owner, other, id };
}
const row = (db: D1Database, id: number) =>
  db.prepare("SELECT status, owner_consent, cover_key, photo_keys, slug FROM spaces WHERE id = ?").bind(id).first<{ status: string; owner_consent: number; cover_key: string | null; photo_keys: string | null; slug: string }>();

describe("createOwnerSpace cover", () => {
  it("defaults the cover to the first photo", async () => {
    const { db, id } = await setup();
    expect((await row(db, id))?.cover_key).toBe("owner-photos/a.png");
  });
  it("has no cover without photos", async () => {
    const { db, id } = await setup([]);
    expect((await row(db, id))?.cover_key).toBeNull();
  });
});

describe("listOwnerSpaces hasCover", () => {
  it("is true with a cover or any photo, false otherwise", async () => {
    const { db, owner, id } = await setup();
    const none = await createOwnerSpace(db, owner.id, input([]));
    const cards = await listOwnerSpaces(db, owner.id);
    expect(cards.find((c) => c.id === id)?.hasCover).toBe(true);
    expect(cards.find((c) => c.id === none)?.hasCover).toBe(false);
    await db.prepare("UPDATE spaces SET cover_key = NULL WHERE id = ?").bind(id).run();
    expect((await listOwnerSpaces(db, owner.id)).find((c) => c.id === id)?.hasCover).toBe(true);
  });
});

describe("setCoverKey", () => {
  it("changes the cover to one of the photos", async () => {
    const { db, owner, id } = await setup();
    expect(await setCoverKey(db, owner.id, id, "owner-photos/b.jpg")).toBe(true);
    expect((await row(db, id))?.cover_key).toBe("owner-photos/b.jpg");
  });
  it("refuses keys that are not the space's photos", async () => {
    const { db, owner, id } = await setup();
    expect(await setCoverKey(db, owner.id, id, "owner-photos/evil.png")).toBe(false);
    expect(await setCoverKey(db, owner.id, id, "consent/secret.pdf")).toBe(false);
    expect((await row(db, id))?.cover_key).toBe("owner-photos/a.png");
  });
  it("is owner-isolated", async () => {
    const { db, other, id } = await setup();
    expect(await setCoverKey(db, other.id, id, "owner-photos/b.jpg")).toBe(false);
    expect((await row(db, id))?.cover_key).toBe("owner-photos/a.png");
  });
});

describe("addSpacePhotos", () => {
  it("appends and keeps the cover", async () => {
    const { db, owner, id } = await setup();
    expect(await addSpacePhotos(db, owner.id, id, ["owner-photos/c.png"])).toBe(true);
    const r = await row(db, id);
    expect(JSON.parse(r!.photo_keys!)).toEqual(["owner-photos/a.png", "owner-photos/b.jpg", "owner-photos/c.png"]);
    expect(r?.cover_key).toBe("owner-photos/a.png");
  });
  it("sets the cover when there was none", async () => {
    const { db, owner, id } = await setup([]);
    expect(await addSpacePhotos(db, owner.id, id, ["owner-photos/x.png", "owner-photos/y.png"])).toBe(true);
    expect((await row(db, id))?.cover_key).toBe("owner-photos/x.png");
  });
  it(`allows at most ${MAX_PHOTOS} photos in total`, async () => {
    const { db, owner, id } = await setup();
    expect(await addSpacePhotos(db, owner.id, id, ["1", "2", "3", "4"].map((n) => `owner-photos/${n}.png`))).toBe(false);
    expect(JSON.parse((await row(db, id))!.photo_keys!)).toHaveLength(2);
    expect(await addSpacePhotos(db, owner.id, id, ["1", "2", "3"].map((n) => `owner-photos/${n}.png`))).toBe(true);
    expect(await addSpacePhotos(db, owner.id, id, ["owner-photos/9.png"])).toBe(false);
  });
  it("works while pending or active, not when rejected", async () => {
    const { db, owner, id } = await setup();
    await db.prepare("UPDATE spaces SET status = 'active' WHERE id = ?").bind(id).run();
    expect(await addSpacePhotos(db, owner.id, id, ["owner-photos/c.png"])).toBe(true);
    await db.prepare("UPDATE spaces SET status = 'rejected' WHERE id = ?").bind(id).run();
    expect(await addSpacePhotos(db, owner.id, id, ["owner-photos/d.png"])).toBe(false);
  });
  it("is owner-isolated and ignores an empty list", async () => {
    const { db, owner, other, id } = await setup();
    expect(await addSpacePhotos(db, other.id, id, ["owner-photos/c.png"])).toBe(false);
    expect(await addSpacePhotos(db, owner.id, id, [])).toBe(false);
    expect(JSON.parse((await row(db, id))!.photo_keys!)).toHaveLength(2);
  });
});

function bucket(objects: Record<string, string>) {
  const get = async (key: string) =>
    key in objects ? { body: new Blob(["img"]).stream(), httpMetadata: { contentType: objects[key] } } : null;
  return { get } as unknown as R2Bucket;
}

describe("publicCoverResponse", () => {
  const objects = { "owner-photos/a.png": "image/png", "owner-photos/b.jpg": "image/jpeg" };
  it("404s for pending, rejected, unconsented and unknown slugs identically", async () => {
    const { db, id } = await setup();
    const slug = (await row(db, id))!.slug;
    const texts: string[] = [];
    const check = async (s: string) => {
      const res = await publicCoverResponse({ DB: db, UPLOADS: bucket(objects) }, s);
      expect(res.status).toBe(404);
      texts.push(await res.text());
    };
    await check(slug); // pending
    await db.prepare("UPDATE spaces SET status = 'rejected' WHERE id = ?").bind(id).run();
    await check(slug);
    await db.prepare("UPDATE spaces SET status = 'active', owner_consent = 0 WHERE id = ?").bind(id).run();
    await check(slug);
    await check("no-such-slug");
    expect(new Set(texts).size).toBe(1);
  });
  it("serves the cover for an active, consented space with safe headers", async () => {
    const { db, owner, id } = await setup();
    await db.prepare("UPDATE spaces SET status = 'active' WHERE id = ?").bind(id).run();
    const slug = (await row(db, id))!.slug;
    const res = await publicCoverResponse({ DB: db, UPLOADS: bucket(objects) }, slug);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    await setCoverKey(db, owner.id, id, "owner-photos/b.jpg");
    expect((await publicCoverResponse({ DB: db, UPLOADS: bucket(objects) }, slug)).headers.get("Content-Type")).toBe("image/jpeg");
  });
  it("404s without a cover, a missing object, or a non-image content type", async () => {
    const { db, id } = await setup();
    await db.prepare("UPDATE spaces SET status = 'active' WHERE id = ?").bind(id).run();
    const slug = (await row(db, id))!.slug;
    expect((await publicCoverResponse({ DB: db, UPLOADS: bucket({}) }, slug)).status).toBe(404);
    expect((await publicCoverResponse({ DB: db, UPLOADS: bucket({ "owner-photos/a.png": "text/html" }) }, slug)).status).toBe(404);
    expect((await publicCoverResponse({ DB: db, UPLOADS: bucket({ "owner-photos/a.png": "image/svg+xml" }) }, slug)).status).toBe(404);
    await db.prepare("UPDATE spaces SET photo_keys = NULL, cover_key = NULL WHERE id = ?").bind(id).run();
    expect((await publicCoverResponse({ DB: db, UPLOADS: bucket(objects) }, slug)).status).toBe(404);
  });
});

describe("ownerPhotoResponse", () => {
  const objects = { "owner-photos/a.png": "image/png", "owner-photos/b.jpg": "image/jpeg" };
  it("serves the owner's own cover, even while pending, with private headers", async () => {
    const { db, owner, id } = await setup();
    const res = await ownerPhotoResponse({ DB: db, UPLOADS: bucket(objects) }, owner.id, id, null);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Content-Type")).toBe("image/png");
  });
  it("serves a photo by index and 404s out of range", async () => {
    const { db, owner, id } = await setup();
    expect((await ownerPhotoResponse({ DB: db, UPLOADS: bucket(objects) }, owner.id, id, 1)).headers.get("Content-Type")).toBe("image/jpeg");
    expect((await ownerPhotoResponse({ DB: db, UPLOADS: bucket(objects) }, owner.id, id, 2)).status).toBe(404);
  });
  it("404s for another owner's space", async () => {
    const { db, other, id } = await setup();
    expect((await ownerPhotoResponse({ DB: db, UPLOADS: bucket(objects) }, other.id, id, null)).status).toBe(404);
    expect(await getOwnedSpace(db, other.id, id)).toBeNull();
  });
});

import { applyPhotosForm } from "~/lib/cover.server";

function writableBucket() {
  const puts: string[] = [];
  const deletes: string[] = [];
  const b = {
    put: async (key: string) => void puts.push(key),
    delete: async (key: string) => void deletes.push(key),
    get: async () => null,
  } as unknown as R2Bucket;
  return { b, puts, deletes };
}
const png = (name: string) => new File([new Uint8Array(10)], name);

describe("applyPhotosForm", () => {
  it("changes the cover", async () => {
    const { db, owner, id } = await setup();
    const { b } = writableBucket();
    const form = new FormData();
    form.set("intent", "cover");
    form.set("cover", "owner-photos/b.jpg");
    expect(await applyPhotosForm({ DB: db, UPLOADS: b }, owner.id, id, form)).toEqual({ ok: true });
    expect((await row(db, id))?.cover_key).toBe("owner-photos/b.jpg");
    form.set("cover", "owner-photos/zzz.png");
    expect(await applyPhotosForm({ DB: db, UPLOADS: b }, owner.id, id, form)).toMatchObject({ ok: false, status: 400 });
  });
  it("adds photos and stores them under the owner prefix", async () => {
    const { db, owner, id } = await setup();
    const { b, puts } = writableBucket();
    const form = new FormData();
    form.set("intent", "add");
    form.append("photos", png("c.png"));
    form.append("photos", png("d.webp"));
    expect(await applyPhotosForm({ DB: db, UPLOADS: b }, owner.id, id, form)).toEqual({ ok: true });
    expect(puts).toHaveLength(2);
    expect(JSON.parse((await row(db, id))!.photo_keys!)).toHaveLength(4);
  });
  it("rejects too many photos before storing anything, and bad file types", async () => {
    const { db, owner, id } = await setup();
    const { b, puts } = writableBucket();
    const many = new FormData();
    many.set("intent", "add");
    for (const n of ["1", "2", "3", "4"]) many.append("photos", png(`${n}.png`));
    expect(await applyPhotosForm({ DB: db, UPLOADS: b }, owner.id, id, many)).toMatchObject({ ok: false, status: 400 });
    const bad = new FormData();
    bad.set("intent", "add");
    bad.append("photos", png("x.exe"));
    expect(await applyPhotosForm({ DB: db, UPLOADS: b }, owner.id, id, bad)).toMatchObject({ ok: false, status: 400 });
    const none = new FormData();
    none.set("intent", "add");
    expect(await applyPhotosForm({ DB: db, UPLOADS: b }, owner.id, id, none)).toMatchObject({ ok: false, status: 400 });
    expect(puts).toHaveLength(0);
  });
  it("404s for another owner and for rejected spaces", async () => {
    const { db, owner, other, id } = await setup();
    const { b, puts } = writableBucket();
    const form = new FormData();
    form.set("intent", "add");
    form.append("photos", png("c.png"));
    expect(await applyPhotosForm({ DB: db, UPLOADS: b }, other.id, id, form)).toMatchObject({ ok: false, status: 404 });
    await db.prepare("UPDATE spaces SET status = 'rejected' WHERE id = ?").bind(id).run();
    expect(await applyPhotosForm({ DB: db, UPLOADS: b }, owner.id, id, form)).toMatchObject({ ok: false, status: 404 });
    expect(puts).toHaveLength(0);
  });
});
