import { describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/d1";
import { upsertOwner } from "~/lib/owner-auth.server";
import { createOwnerSpace } from "~/lib/owner-spaces.server";
import { listAdminOwners } from "~/lib/admin-owners.server";

describe("listAdminOwners", () => {
  it("lists owners with their space count and last login, most recent first", async () => {
    const db = createTestDb();
    const a = await upsertOwner(db, "a@x.kr");
    const b = await upsertOwner(db, "b@x.kr");
    await db.prepare("UPDATE owners SET name = '김건물', phone = '010-1111-2222', last_login_at = 2000 WHERE id = ?").bind(a.id).run();
    await db.prepare("UPDATE owners SET last_login_at = 3000 WHERE id = ?").bind(b.id).run();
    for (const name of ["하나", "둘"]) {
      await createOwnerSpace(db, a.id, { name, district: "성동구", neighborhood: "성동구 성수동", locationNotes: null, photoKeys: [] });
    }
    const rows = await listAdminOwners(db);
    expect(rows.map((r) => r.email)).toEqual(["b@x.kr", "a@x.kr"]);
    expect(rows[0]).toMatchObject({ name: null, spaceCount: 0, lastLoginAt: 3000 });
    expect(rows[1]).toMatchObject({ name: "김건물", phone: "010-1111-2222", spaceCount: 2, lastLoginAt: 2000 });
  });

  it("is empty without owners", async () => {
    expect(await listAdminOwners(createTestDb())).toEqual([]);
  });
});
