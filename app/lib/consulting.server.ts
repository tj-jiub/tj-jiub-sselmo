import type { ConsultingMonthInput, EducatorLinkInput } from "./consulting.ts";

export type ConsultingMonthRow = { id: number; month: string; revenue_krw: number; profit_krw: number; fee_krw: number };

export async function addConsultingMonth(
  db: D1Database,
  applicationId: number,
  m: ConsultingMonthInput,
  now = Date.now(),
): Promise<"saved" | "duplicate" | "not-ssulmo"> {
  try {
    await db
      .prepare("INSERT INTO consulting_months (application_id, month, revenue_krw, profit_krw, fee_krw, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(applicationId, m.month, m.revenueKrw, m.profitKrw, m.feeKrw, now)
      .run();
    return "saved";
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("ssulmo track")) return "not-ssulmo";
    if (msg.includes("UNIQUE")) return "duplicate";
    throw e;
  }
}

export async function listConsultingMonths(db: D1Database, applicationId: number): Promise<ConsultingMonthRow[]> {
  const { results } = await db
    .prepare("SELECT id, month, revenue_krw, profit_krw, fee_krw FROM consulting_months WHERE application_id = ? ORDER BY month")
    .bind(applicationId)
    .all<ConsultingMonthRow>();
  return results;
}

export async function addEducatorLink(db: D1Database, applicationId: number, e: EducatorLinkInput, now = Date.now()): Promise<void> {
  await db
    .prepare("INSERT INTO educator_links (application_id, organization, educator_name, connected_on, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(applicationId, e.organization, e.educatorName, e.connectedOn, now)
    .run();
}

export async function listEducatorLinks(
  db: D1Database,
  applicationId: number,
): Promise<Array<{ id: number; organization: string; educator_name: string; connected_on: string }>> {
  const { results } = await db
    .prepare("SELECT id, organization, educator_name, connected_on FROM educator_links WHERE application_id = ? ORDER BY connected_on DESC, id DESC")
    .bind(applicationId)
    .all<{ id: number; organization: string; educator_name: string; connected_on: string }>();
  return results;
}
