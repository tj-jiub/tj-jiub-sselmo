import { applicationStage, spaceStage } from "./admin-stage.ts";
import type { ApplicationStageKey, SpaceStageInfo } from "./admin-stage.ts";
import { resolveCoverKey } from "./cover.ts";
import { listShortlist } from "./owner.server.ts";

/** KST month as YYYY-MM (the format consulting_months.month uses). */
export function kstMonth(now: number): string {
  return new Date(now + 9 * 3_600_000).toISOString().slice(0, 7);
}

const count = async (db: D1Database, sql: string, ...params: Array<string | number>) =>
  (await db.prepare(sql).bind(...params).first<{ n: number }>())?.n ?? 0;

export type AdminTodoCounts = { pendingSpaces: number; unmailed: number; aiFailed: number; revenueMissing: number; total: number };

export async function adminTodoCounts(db: D1Database, now: number): Promise<AdminTodoCounts> {
  // New owner spaces plus photo changes waiting on an already-public space.
  const pendingSpaces = await count(
    db,
    "SELECT COUNT(*) AS n FROM spaces WHERE status = 'pending' OR (status = 'active' AND (pending_photo_keys IS NOT NULL OR pending_cover_key IS NOT NULL))",
  );
  const unmailed = await count(db, "SELECT COUNT(*) AS n FROM applications WHERE ai_status = 'done' AND result_mailed_at IS NULL");
  const aiFailed = await count(db, "SELECT COUNT(*) AS n FROM applications WHERE ai_status = 'failed'");
  const revenueMissing = await count(
    db,
    `SELECT COUNT(*) AS n FROM applications a
     WHERE a.track = 'ssulmo' AND a.consent_consulting_at IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM consulting_months m WHERE m.application_id = a.id AND m.month = ?)`,
    kstMonth(now),
  );
  return { pendingSpaces, unmailed, aiFailed, revenueMissing, total: pendingSpaces + unmailed + aiFailed + revenueMissing };
}

export type AdminNavCounts = { todo: number; spaces: number; applications: number; owners: number };

export async function adminNavCounts(db: D1Database, now: number): Promise<AdminNavCounts> {
  return {
    todo: (await adminTodoCounts(db, now)).total,
    spaces: await count(db, "SELECT COUNT(*) AS n FROM spaces"),
    applications: await count(db, "SELECT COUNT(*) AS n FROM applications"),
    owners: await count(db, "SELECT COUNT(*) AS n FROM owners"),
  };
}

export type AdminSpaceRow = {
  id: number;
  name: string;
  neighborhood: string;
  slug: string;
  status: "pending" | "active" | "rejected";
  owner_consent: number;
  owner_id: number | null;
  /** Owner display name (null for operator-registered spaces or owners without a name). */
  owner_name: string | null;
  /** Resolved cover (never a key outside photo_keys); null = no photo. */
  cover_key: string | null;
  response_count: number;
  /** Shortlist size, counted for public spaces only. */
  candidate_count: number;
  stage: SpaceStageInfo;
};

const parseKeys = (raw: string | null): string[] => {
  try {
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? v.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
};

export async function listAdminSpaces(db: D1Database, opts: { status?: string; q?: string }): Promise<AdminSpaceRow[]> {
  const { results } = await db
    .prepare(
      `SELECT s.id, s.name, s.neighborhood, s.slug, s.status, s.owner_consent, s.owner_id, s.photo_keys, s.cover_key,
              o.name AS owner_name,
              (SELECT COUNT(*) FROM survey_responses r WHERE r.space_id = s.id) AS response_count
       FROM spaces s LEFT JOIN owners o ON o.id = s.owner_id ORDER BY s.id DESC`,
    )
    .all<{
      id: number; name: string; neighborhood: string; slug: string; status: AdminSpaceRow["status"]; owner_consent: number;
      owner_id: number | null; photo_keys: string | null; cover_key: string | null; owner_name: string | null; response_count: number;
    }>();
  const q = opts.q?.trim().toLowerCase();
  const rows: AdminSpaceRow[] = [];
  for (const r of results) {
    if (q && !r.name.toLowerCase().includes(q) && !r.neighborhood.toLowerCase().includes(q)) continue;
    const isPublic = r.status === "active" && r.owner_consent === 1;
    const candidate_count = isPublic ? (await listShortlist(db, r.id)).length : 0;
    const stage = spaceStage({ status: r.status, owner_consent: r.owner_consent, response_count: r.response_count, candidate_count });
    if (opts.status && SPACE_KEYS.has(opts.status) && stage.key !== opts.status) continue;
    rows.push({
      id: r.id, name: r.name, neighborhood: r.neighborhood, slug: r.slug, status: r.status, owner_consent: r.owner_consent,
      owner_id: r.owner_id, owner_name: r.owner_name, cover_key: resolveCoverKey(parseKeys(r.photo_keys), r.cover_key),
      response_count: r.response_count, candidate_count, stage,
    });
  }
  return rows;
}
const SPACE_KEYS = new Set(["pending", "collecting", "ready", "rejected", "private"]);

export type AdminApplicationRow = {
  id: number;
  space_id: number;
  space_name: string;
  neighborhood: string;
  cover_key: string | null;
  contact_name: string;
  business_type: string;
  track: "ssulmo" | "general";
  ai_status: "pending" | "done" | "failed";
  ai_score: number | null;
  result_mailed_at: number | null;
  created_at: number;
  stage: { key: ApplicationStageKey; label: string; stepIndex: 0 | 1 | 2 | 3 | 4 };
};

const APP_KEYS = new Set(["evaluating", "mail", "owner-review", "failed"]);

export async function listAdminApplications(db: D1Database, opts: { status?: string }): Promise<AdminApplicationRow[]> {
  const { results } = await db
    .prepare(
      `SELECT a.id, a.space_id, a.contact_name, a.business_type, a.track, a.ai_status, a.ai_score, a.result_mailed_at, a.created_at,
              s.name AS space_name, s.neighborhood, s.photo_keys, s.cover_key,
              EXISTS (SELECT 1 FROM broker_intros b WHERE b.application_id = a.id) AS has_broker_intro
       FROM applications a JOIN spaces s ON s.id = a.space_id ORDER BY a.id DESC`,
    )
    .all<Omit<AdminApplicationRow, "stage" | "cover_key"> & { photo_keys: string | null; cover_key: string | null; has_broker_intro: number }>();
  const rows: AdminApplicationRow[] = [];
  for (const r of results) {
    const stage = applicationStage({ ai_status: r.ai_status, result_mailed_at: r.result_mailed_at, has_broker_intro: r.has_broker_intro === 1 });
    if (opts.status && APP_KEYS.has(opts.status) && stage.key !== opts.status) continue;
    const { photo_keys, has_broker_intro: _h, ...rest } = r;
    rows.push({ ...rest, cover_key: resolveCoverKey(parseKeys(photo_keys), r.cover_key), stage });
  }
  return rows;
}
