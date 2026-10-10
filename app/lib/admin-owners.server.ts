export type AdminOwnerRow = {
  id: number;
  name: string | null;
  email: string;
  phone: string | null;
  spaceCount: number;
  lastLoginAt: number | null;
  createdAt: number;
};

/** Admin-only list of building owners (contains PII; never expose outside /admin). */
export async function listAdminOwners(db: D1Database): Promise<AdminOwnerRow[]> {
  const { results } = await db
    .prepare(
      `SELECT o.id, o.name, o.email, o.phone, o.last_login_at, o.created_at,
              (SELECT COUNT(*) FROM spaces s WHERE s.owner_id = o.id) AS space_count
       FROM owners o ORDER BY COALESCE(o.last_login_at, o.created_at) DESC, o.id DESC`,
    )
    .all<{ id: number; name: string | null; email: string; phone: string | null; last_login_at: number | null; created_at: number; space_count: number }>();
  return results.map((r) => ({
    id: r.id, name: r.name, email: r.email, phone: r.phone, spaceCount: r.space_count, lastLoginAt: r.last_login_at, createdAt: r.created_at,
  }));
}
