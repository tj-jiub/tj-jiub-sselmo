import { toHex } from "./hex";
import type { SurveyAnswers } from "./survey";

export const RESPONSE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export async function hashDeviceId(id: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(id)));
}

export async function saveResponse(
  db: D1Database,
  spaceId: number,
  deviceHash: string,
  answers: SurveyAnswers,
  now = Date.now(),
): Promise<"saved" | "cooldown"> {
  const recent = await db
    .prepare("SELECT 1 FROM survey_responses WHERE space_id = ? AND device_hash = ? AND created_at > ? LIMIT 1")
    .bind(spaceId, deviceHash, now - RESPONSE_COOLDOWN_MS)
    .first();
  if (recent) return "cooldown";
  await db
    .prepare("INSERT INTO survey_responses (space_id, answers, device_hash, created_at) VALUES (?, ?, ?, ?)")
    .bind(spaceId, JSON.stringify(answers), deviceHash, now)
    .run();
  return "saved";
}

export async function saveContact(db: D1Database, spaceId: number, contact: string, now = Date.now()): Promise<void> {
  await db
    .prepare("INSERT INTO survey_contacts (space_id, contact, privacy_consented_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(spaceId, contact, now, now)
    .run();
}

export async function listAnswers(db: D1Database, spaceId: number): Promise<SurveyAnswers[]> {
  const { results } = await db
    .prepare("SELECT answers FROM survey_responses WHERE space_id = ? ORDER BY id")
    .bind(spaceId)
    .all<{ answers: string }>();
  return results.map((r) => JSON.parse(r.answers) as SurveyAnswers);
}

export async function listContacts(db: D1Database, spaceId: number): Promise<Array<{ contact: string; created_at: number }>> {
  const { results } = await db
    .prepare("SELECT contact, created_at FROM survey_contacts WHERE space_id = ? ORDER BY id DESC")
    .bind(spaceId)
    .all<{ contact: string; created_at: number }>();
  return results;
}
