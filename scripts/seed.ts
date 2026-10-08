// Local seed: 6 spaces (mangwon-01 has 60 survey responses + 3 applications; the others
// exist for the /find matching flow), all with deterministic data.
// Usage: node scripts/seed.ts > .wrangler/seed.sql (wired up as `npm run db:seed`).
// Wipes existing rows first — local development only.
import { BUSINESS_TYPES, RESPONDENT_TYPE, SPEND_RANGE, VISIT_FREQUENCY, VISIT_TIME } from "../app/lib/survey.ts";

let state = 42;
const rand = () => {
  state = (state * 1664525 + 1013904223) % 2 ** 32;
  return state / 2 ** 32;
};
const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
const q = (v: string | number | null) => (v === null ? "NULL" : typeof v === "number" ? String(v) : `'${v.replaceAll("'", "''")}'`);

const now = Date.now();
const day = 24 * 60 * 60 * 1000;
const space = "(SELECT id FROM spaces WHERE slug = 'mangwon-01')";
const out: string[] = [
  "DELETE FROM broker_intros;",
  "DELETE FROM applications;",
  "DELETE FROM survey_contacts;",
  "DELETE FROM survey_responses;",
  "DELETE FROM spaces;",
  `INSERT INTO spaces (name, district, neighborhood, slug, owner_consent, consent_file_key, created_at) VALUES ('망원동 1층 코너 공실', '마포구', '마포구 망원동', 'mangwon-01', 1, NULL, ${now - 20 * day});`,
];

// Skew demand so the report has a visible ranking.
const weighted = ["아이스크림·디저트", "아이스크림·디저트", "카페", "베이커리", "반찬가게", ...BUSINESS_TYPES];
const otherIdeas = ["아이스크림집", "수제버거", "문구점", "키즈카페", "무인 사진관"];

for (let i = 0; i < 60; i++) {
  const types = [...new Set([pick(weighted), pick(weighted), pick(weighted)].slice(0, 1 + Math.floor(rand() * 3)))];
  const other = rand() < 0.15 ? pick(otherIdeas) : null;
  const answers = {
    businessTypes: other ? types.slice(0, 2) : types,
    businessTypeOther: other,
    visitFrequency: pick(VISIT_FREQUENCY).value,
    spendRange: pick(SPEND_RANGE).value,
    visitTime: pick(VISIT_TIME).value,
    respondentType: pick(RESPONDENT_TYPE).value,
  };
  out.push(
    `INSERT INTO survey_responses (space_id, answers, device_hash, created_at) VALUES (${space}, ${q(JSON.stringify(answers))}, ${q(`seed-device-${i}`)}, ${now - Math.floor(rand() * 14 * day)});`,
  );
}

// Matching-flow spaces. Each type gets a cyclic window of respondents so the
// per-type counts (M) are exact and no response has more than 3 types.
type Extra = { slug: string; name: string; district: string; neighborhood: string; consent: 0 | 1; total: number; counts: Record<string, number> };
const extraSpaces: Extra[] = [
  { slug: "seongsu-01", name: "성수동 골목 1층 공실", district: "성동구", neighborhood: "성동구 성수동", consent: 1, total: 120, counts: { "아이스크림·디저트": 100, 카페: 54, 베이커리: 41 } },
  { slug: "seongsu-02", name: "금호동 역세권 1층 공실", district: "성동구", neighborhood: "성동구 금호동", consent: 1, total: 73, counts: { 반찬가게: 31, 세탁소: 22, 분식: 18 } },
  // Under the 50-response threshold: must show as "집계 중" without numbers.
  { slug: "yongsan-01", name: "이태원동 2층 공실", district: "용산구", neighborhood: "용산구 이태원동", consent: 1, total: 20, counts: { 베이커리: 8, 카페: 5 } },
  // No building-owner consent: must never appear on any public page.
  { slug: "hidden-01", name: "연희동 비공개 공실", district: "서대문구", neighborhood: "서대문구 연희동", consent: 0, total: 80, counts: { 베이커리: 70, 꽃집: 30 } },
];
for (const [k, sp] of extraSpaces.entries()) {
  out.push(
    `INSERT INTO spaces (name, district, neighborhood, slug, owner_consent, consent_file_key, created_at) VALUES (${q(sp.name)}, ${q(sp.district)}, ${q(sp.neighborhood)}, ${q(sp.slug)}, ${sp.consent}, NULL, ${now - (18 - k) * day});`,
  );
  const picks: string[][] = Array.from({ length: sp.total }, () => []);
  let offset = 0;
  for (const [type, count] of Object.entries(sp.counts)) {
    for (let j = 0; j < count; j++) picks[(offset + j) % sp.total].push(type);
    offset += Math.floor(sp.total / 3);
  }
  for (const [i, types] of picks.entries()) {
    if (types.length > 3) throw new Error(`${sp.slug}: response ${i} has ${types.length} types`);
    const answers = {
      businessTypes: types,
      businessTypeOther: null,
      visitFrequency: VISIT_FREQUENCY[i % VISIT_FREQUENCY.length].value,
      spendRange: SPEND_RANGE[i % SPEND_RANGE.length].value,
      visitTime: VISIT_TIME[i % VISIT_TIME.length].value,
      respondentType: RESPONDENT_TYPE[i % RESPONDENT_TYPE.length].value,
    };
    out.push(
      `INSERT INTO survey_responses (space_id, answers, device_hash, created_at) VALUES ((SELECT id FROM spaces WHERE slug = ${q(sp.slug)}), ${q(JSON.stringify(answers))}, ${q(`seed-${sp.slug}-${i}`)}, ${now - (i % 14) * day});`,
    );
  }
}

out.push(
  `INSERT INTO survey_contacts (space_id, contact, privacy_consented_at, created_at) VALUES (${space}, 'seed@example.com', ${now - 3 * day}, ${now - 3 * day});`,
);

// Fixed tokens so the e2e test and manual checks can open result pages.
const applications = [
  { type: "젤라또 가게", name: "김예시", cost: 4500, broker: 1, token: "a".repeat(32), verdict: "fit", resultSent: 1, score: 78, requested: true, paid: 1, feedback: "점심·오후 수요가 높아 테이크아웃 중심이 맞아요.", fbSent: 1 },
  { type: "반찬가게", name: "이예시", cost: 3000, broker: 0, token: "b".repeat(32), verdict: "improve", resultSent: 1, score: 64, requested: false, paid: 0, feedback: null, fbSent: 0 },
  { type: "베이커리 카페", name: "박예시", cost: 8000, broker: 1, token: "c".repeat(32), verdict: null, resultSent: 0, score: null, requested: false, paid: 0, feedback: null, fbSent: 0 },
];
for (const [i, a] of applications.entries()) {
  const t = now - (5 - i) * day;
  const req = a.requested ? t + day : null;
  const summary = a.verdict ? `${a.type} 수요는 이 공간 상위권이에요. 객단가와 영업 시간대를 설문 결과와 맞춰 보세요.` : null;
  out.push(
    `INSERT INTO applications (space_id, result_token, business_type, plan_text, plan_file_key, est_cost_manwon, contact_name, email, consent_privacy_at, consent_intro_terms_at, consent_broker_intro, consent_broker_intro_at, result_verdict, result_summary, result_sent, reference_score, feedback_requested_at, consent_fee_terms_at, payment_confirmed, feedback, feedback_sent, created_at) VALUES (${space}, ${q(a.token)}, ${q(a.type)}, ${q(`${a.type} 사업계획 예시입니다. 주 고객은 망원동 주민과 직장인입니다.`)}, NULL, ${a.cost}, ${q(a.name)}, ${q(`seed${i}@example.com`)}, ${t}, ${t}, ${a.broker}, ${a.broker ? t : "NULL"}, ${q(a.verdict)}, ${q(summary)}, ${a.resultSent}, ${q(a.score)}, ${q(req)}, ${q(req)}, ${a.paid}, ${q(a.feedback)}, ${a.fbSent}, ${t});`,
  );
}
out.push(
  `INSERT INTO broker_intros (application_id, broker_name, introduced_on, created_at) VALUES ((SELECT id FROM applications WHERE contact_name = '김예시'), '망원 예시 공인중개사', '${new Date(now - day).toISOString().slice(0, 10)}', ${now});`,
);

console.log(out.join("\n"));
