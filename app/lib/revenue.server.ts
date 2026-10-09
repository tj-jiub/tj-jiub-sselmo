import { estimateRevenue, type RevenueEstimate } from "./revenue.ts";
import { aggregate, isPublicReady } from "./report.ts";
import type { Space } from "./spaces.server";
import { listAnswers } from "./surveys.server";

export type SpaceDemand = {
  total: number;
  ready: boolean;
  /** Top-demand type; null while the space has no answers. */
  topType: { type: string; count: number } | null;
  /** Estimate for the top type, or null below the 50-response threshold ("집계 중"). */
  estimate: RevenueEstimate | null;
};

export async function loadSpaceDemand(db: D1Database, space: Pick<Space, "id" | "margin_pct" | "scale_factor">): Promise<SpaceDemand> {
  const answers = await listAnswers(db, space.id);
  const report = aggregate(answers);
  const top = report.byType[0] ?? null;
  const ready = isPublicReady(report.total);
  return {
    total: report.total,
    ready,
    topType: top,
    estimate: ready && top ? estimateRevenue(answers, top.type, { scaleFactor: space.scale_factor, marginPct: space.margin_pct }) : null,
  };
}
