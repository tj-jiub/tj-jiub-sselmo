import { toHex } from "./hex.ts";
import type { AiReport } from "./ai-report.ts";
import { aggregate, formatIntent, isPublicReady } from "./report.ts";
import { shortlist } from "./shortlist.ts";
import type { SurveyAnswers } from "./survey.ts";
import type { Track } from "./applications.server.ts";

// 128 random bits: /o/:token has no login, so the token is the only key.
const newToken = () => toHex(crypto.getRandomValues(new Uint8Array(16)));

export async function ensureOwnerToken(db: D1Database, spaceId: number): Promise<string> {
  const row = await db.prepare("SELECT owner_token FROM spaces WHERE id = ?").bind(spaceId).first<{ owner_token: string | null }>();
  if (!row) throw new Error("space not found");
  if (row.owner_token) return row.owner_token;
  return regenerateOwnerToken(db, spaceId);
}

export async function regenerateOwnerToken(db: D1Database, spaceId: number): Promise<string> {
  const token = newToken();
  await db.prepare("UPDATE spaces SET owner_token = ? WHERE id = ?").bind(token, spaceId).run();
  return token;
}

export type Candidate = {
  id: number;
  rank: number;
  businessType: string;
  score: number;
  summary: string;
  strengths: string[];
  risks: string[];
  track: Track;
  estCostManwon: number;
};

/** Shortlist for one space. Explicit columns only: no name, email or plan text. */
export async function listShortlist(db: D1Database, spaceId: number): Promise<Candidate[]> {
  const { results } = await db
    .prepare(
      `SELECT id, business_type, est_cost_manwon, track, ai_status, ai_score, ai_report, created_at
       FROM applications WHERE space_id = ? AND ai_status = 'done'`,
    )
    .bind(spaceId)
    .all<{
      id: number;
      business_type: string;
      est_cost_manwon: number;
      track: Track;
      ai_status: "done";
      ai_score: number | null;
      ai_report: string | null;
      created_at: number;
    }>();
  const ranked = shortlist(results.map((r) => ({ ...r, score: r.ai_score, status: r.ai_status, createdAt: r.created_at })));
  return ranked.flatMap((r, i) => {
    if (!r.ai_report) return [];
    const report = JSON.parse(r.ai_report) as AiReport;
    return [
      {
        id: r.id,
        rank: i + 1,
        businessType: r.business_type,
        score: report.score,
        summary: report.summary,
        strengths: report.strengths,
        risks: report.risks,
        track: r.track,
        estCostManwon: r.est_cost_manwon,
      },
    ];
  });
}

export type OwnerView = {
  space: { name: string; neighborhood: string };
  demand: { ready: boolean; total: number; top: Array<{ type: string; count: number; phrase: string }> };
  candidates: Candidate[];
};

// Not gated by owner_consent: the unguessable token is the key, and the operator
// creates the link for the owner on purpose.
export async function getOwnerView(db: D1Database, token: string): Promise<OwnerView | null> {
  if (!token) return null;
  const space = await db.prepare("SELECT id, name, neighborhood FROM spaces WHERE owner_token = ?").bind(token).first<{
    id: number;
    name: string;
    neighborhood: string;
  }>();
  if (!space) return null;
  const { results } = await db.prepare("SELECT answers FROM survey_responses WHERE space_id = ?").bind(space.id).all<{ answers: string }>();
  const report = aggregate(results.map((r) => JSON.parse(r.answers) as SurveyAnswers));
  // Below the public threshold nothing numeric is shown, same rule as /r/:slug.
  const demand = isPublicReady(report.total)
    ? { ready: true, total: report.total, top: report.byType.slice(0, 3).map((t) => ({ ...t, phrase: formatIntent(report.total, t.count) })) }
    : { ready: false, total: 0, top: [] };
  return { space: { name: space.name, neighborhood: space.neighborhood }, demand, candidates: await listShortlist(db, space.id) };
}
