import type { AiReport } from "./ai-report.ts";
import { aggregate, formatIntent, isPublicReady } from "./report.ts";
import { shortlist } from "./shortlist.ts";
import type { SurveyAnswers } from "./survey.ts";
import type { Track } from "./applications.server.ts";

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

/** Shortlist for one space (also the admin preview). Explicit columns only: no name, email or plan text. */
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

export type SpaceDemand = { ready: boolean; total: number; top: Array<{ type: string; count: number; phrase: string }> };

/** Same threshold rule as /r/:slug: below 50 responses nothing numeric is shown. */
export async function getSpaceDemand(db: D1Database, spaceId: number): Promise<SpaceDemand> {
  const { results } = await db.prepare("SELECT answers FROM survey_responses WHERE space_id = ?").bind(spaceId).all<{ answers: string }>();
  const report = aggregate(results.map((r) => JSON.parse(r.answers) as SurveyAnswers));
  return isPublicReady(report.total)
    ? { ready: true, total: report.total, top: report.byType.slice(0, 3).map((t) => ({ ...t, phrase: formatIntent(report.total, t.count) })) }
    : { ready: false, total: 0, top: [] };
}
