import { describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/d1";
import { upsertOwner } from "~/lib/owner-auth.server";
import {
  addSpacePhotos,
  approvePhotoChange,
  approveSpace,
  createOwnerSpace,
  listPhotoReviews,
  rejectPhotoChange,
  setCoverKey,
} from "~/lib/owner-spaces.server";
import { ownerPhotoResponse, publicCoverResponse } from "~/lib/cover.server";
import { adminTodoCounts } from "~/lib/admin-todo.server";

// Photo changes on an already-public space wait for the operator (user decision 2026-10-10).
const input = { name: "공간", district: "성동구", neighborhood: "성동구 성수동", locationNotes: null, photoKeys: ["owner-photos/a.png", "owner-photos/b.jpg"] };

async function activeSpace() {
  const db = createTestDb();
  const owner = await upsertOwner(db, "o@x.kr");
  const id = await createOwnerSpace(db, owner.id, input);
  await approveSpace(db, id);
  return { db, owner, id };
}
const row = (db: D1Database, id: number) =>
  db
    .prepare("SELECT photo_keys, cover_key, pending_photo_keys, pending_cover_key, slug FROM spaces WHERE id = ?")
    .bind(id)
    .first<{ photo_keys: string; cover_key: string | null; pending_photo_keys: string | null; pending_cover_key: string | null; slug: string }>();

function bucket(objects: Record<string, string>) {
  const get = async (key: string) =>
    key in objects ? { body: new Blob(["img"]).stream(), httpMetadata: { contentType: objects[key] } } : null;
  return { get } as unknown as R2Bucket;
}
const objects = { "owner-photos/a.png": "image/png", "owner-photos/b.jpg": "image/jpeg", "owner-photos/c.png": "image/png" };

describe("photo changes on an active space are staged for review", () => {
  it("a cover change leaves the public cover untouched until approved", async () => {
    const { db, owner, id } = await activeSpace();
    expect(await setCoverKey(db, owner.id, id, "owner-photos/b.jpg")).toBe(true);
    const r = await row(db, id);
    expect(r?.cover_key).toBe("owner-photos/a.png");
    expect(r?.pending_cover_key).toBe("owner-photos/b.jpg");
    const env = { DB: db, UPLOADS: bucket(objects) };
    expect((await publicCoverResponse(env, r!.slug)).headers.get("Content-Type")).toBe("image/png");
    // The owner already sees their proposal.
    expect((await ownerPhotoResponse(env, owner.id, id, null)).headers.get("Content-Type")).toBe("image/jpeg");
  });

  it("added photos are staged, not published", async () => {
    const { db, owner, id } = await activeSpace();
    expect(await addSpacePhotos(db, owner.id, id, ["owner-photos/c.png"])).toBe(true);
    const r = await row(db, id);
    expect(JSON.parse(r!.photo_keys)).toEqual(["owner-photos/a.png", "owner-photos/b.jpg"]);
    expect(JSON.parse(r!.pending_photo_keys!)).toEqual(["owner-photos/a.png", "owner-photos/b.jpg", "owner-photos/c.png"]);
    const env = { DB: db, UPLOADS: bucket(objects) };
    expect((await ownerPhotoResponse(env, owner.id, id, 2)).status).toBe(200);
  });

  it("a cover change can pick a photo that is itself still staged", async () => {
    const { db, owner, id } = await activeSpace();
    await addSpacePhotos(db, owner.id, id, ["owner-photos/c.png"]);
    expect(await setCoverKey(db, owner.id, id, "owner-photos/c.png")).toBe(true);
    expect((await row(db, id))?.pending_cover_key).toBe("owner-photos/c.png");
  });

  it("pending spaces still change directly (the whole space is under review)", async () => {
    const db = createTestDb();
    const owner = await upsertOwner(db, "o@x.kr");
    const id = await createOwnerSpace(db, owner.id, input);
    await setCoverKey(db, owner.id, id, "owner-photos/b.jpg");
    const r = await row(db, id);
    expect(r?.cover_key).toBe("owner-photos/b.jpg");
    expect(r?.pending_cover_key).toBeNull();
    expect(r?.pending_photo_keys).toBeNull();
  });
});

describe("operator review", () => {
  it("approve publishes the staged photos and cover and clears the proposal", async () => {
    const { db, owner, id } = await activeSpace();
    await addSpacePhotos(db, owner.id, id, ["owner-photos/c.png"]);
    await setCoverKey(db, owner.id, id, "owner-photos/c.png");
    expect(await approvePhotoChange(db, id)).toBe(true);
    const r = await row(db, id);
    expect(JSON.parse(r!.photo_keys)).toEqual(["owner-photos/a.png", "owner-photos/b.jpg", "owner-photos/c.png"]);
    expect(r?.cover_key).toBe("owner-photos/c.png");
    expect(r?.pending_photo_keys).toBeNull();
    expect(r?.pending_cover_key).toBeNull();
    expect(await approvePhotoChange(db, id)).toBe(false); // nothing left to approve
  });

  it("reject keeps the published photos and returns only the newly uploaded keys to delete", async () => {
    const { db, owner, id } = await activeSpace();
    await addSpacePhotos(db, owner.id, id, ["owner-photos/c.png"]);
    await setCoverKey(db, owner.id, id, "owner-photos/b.jpg");
    expect(await rejectPhotoChange(db, id)).toEqual({ ok: true, orphanKeys: ["owner-photos/c.png"] });
    const r = await row(db, id);
    expect(JSON.parse(r!.photo_keys)).toEqual(["owner-photos/a.png", "owner-photos/b.jpg"]);
    expect(r?.cover_key).toBe("owner-photos/a.png");
    expect(r?.pending_photo_keys).toBeNull();
    expect(r?.pending_cover_key).toBeNull();
    expect(await rejectPhotoChange(db, id)).toEqual({ ok: false, orphanKeys: [] });
  });

  it("counts photo reviews in the admin 'approval waiting' to-do", async () => {
    const { db, owner, id } = await activeSpace();
    expect((await adminTodoCounts(db, Date.now())).pendingSpaces).toBe(0);
    await setCoverKey(db, owner.id, id, "owner-photos/b.jpg");
    expect((await adminTodoCounts(db, Date.now())).pendingSpaces).toBe(1);
    await approvePhotoChange(db, id);
    expect((await adminTodoCounts(db, Date.now())).pendingSpaces).toBe(0);
  });
});

describe("listPhotoReviews", () => {
  it("lists active spaces with a waiting change: published vs proposed, and which photos are new", async () => {
    const { db, owner, id } = await activeSpace();
    expect(await listPhotoReviews(db)).toEqual([]);
    await addSpacePhotos(db, owner.id, id, ["owner-photos/c.png"]);
    await setCoverKey(db, owner.id, id, "owner-photos/c.png");
    const [r] = await listPhotoReviews(db);
    expect(r).toMatchObject({
      id,
      name: "공간",
      currentCover: "owner-photos/a.png",
      proposedCover: "owner-photos/c.png",
      proposedKeys: ["owner-photos/a.png", "owner-photos/b.jpg", "owner-photos/c.png"],
      newKeys: ["owner-photos/c.png"],
    });
  });
});

