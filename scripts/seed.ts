// Local seed: 6 spaces (mangwon-01 has 60 survey responses + 3 applications; seongsu-01 has 120
// responses + 8 applications; the others exist for the /find matching flow), all deterministic.
// Applications are evaluated here with the real fake evaluator, so the admin, result and owner
// pages show realistic AI results.
// Fixed owner tokens: /o/oooo... (mangwon-01), /o/pppp... (seongsu-01), 32 chars each.
// Usage: node scripts/seed.ts > .wrangler/seed.sql (wired up as `npm run db:seed`).
// Wipes existing rows first — local development only.
// Imports use explicit .ts extensions and only modules without path aliases (plain node type-stripping).
import { BUSINESS_TYPES, RESPONDENT_TYPE, SPEND_RANGE, VISIT_FREQUENCY, VISIT_TIME, type SurveyAnswers } from "../app/lib/survey.ts";
import { consultingFee } from "../app/lib/consulting.ts";
import { fakeEvaluator } from "../app/lib/evaluator.server.ts";
import type { EvalInput } from "../app/lib/ai-prompt.ts";
import { aggregate, distribution } from "../app/lib/report.ts";
import { estimateRevenue, matchBusinessType } from "../app/lib/revenue.ts";

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
// Survey answers per evaluated space, kept in memory to build the evaluator input.
const answersBySlug: Record<string, SurveyAnswers[]> = { "mangwon-01": [], "seongsu-01": [] };
const out: string[] = [
  "DELETE FROM consulting_months;",
  "DELETE FROM educator_links;",
  "DELETE FROM broker_intros;",
  "DELETE FROM applications;",
  "DELETE FROM survey_contacts;",
  "DELETE FROM survey_responses;",
  "DELETE FROM spaces;",
  `INSERT INTO spaces (name, district, neighborhood, slug, owner_consent, consent_file_key, location_notes, owner_token, created_at) VALUES ('망원동 1층 코너 공실', '마포구', '마포구 망원동', 'mangwon-01', 1, NULL, '망원시장 입구 도보 2분, 골목 코너 1층, 낮에는 주민·저녁에는 직장인 유동', '${"o".repeat(32)}', ${now - 20 * day});`,
];

// Skew demand so the report has a visible ranking.
const weighted = ["아이스크림·디저트", "아이스크림·디저트", "카페", "베이커리", "반찬가게", ...BUSINESS_TYPES];
const otherIdeas = ["아이스크림집", "수제버거", "문구점", "키즈카페", "무인 사진관"];

for (let i = 0; i < 60; i++) {
  const types = [...new Set([pick(weighted), pick(weighted), pick(weighted)].slice(0, 1 + Math.floor(rand() * 3)))];
  const other = rand() < 0.15 ? pick(otherIdeas) : null;
  const answers: SurveyAnswers = {
    businessTypes: other ? types.slice(0, 2) : types,
    businessTypeOther: other,
    visitFrequency: pick(VISIT_FREQUENCY).value,
    spendRange: pick(SPEND_RANGE).value,
    visitTime: pick(VISIT_TIME).value,
    respondentType: pick(RESPONDENT_TYPE).value,
  };
  answersBySlug["mangwon-01"].push(answers);
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
  const seongsu = sp.slug === "seongsu-01";
  out.push(
    `INSERT INTO spaces (name, district, neighborhood, slug, owner_consent, consent_file_key, location_notes, owner_token, margin_pct, scale_factor, created_at) VALUES (${q(sp.name)}, ${q(sp.district)}, ${q(sp.neighborhood)}, ${q(sp.slug)}, ${sp.consent}, NULL, ${q(seongsu ? "성수역 3번 출구 도보 4분, 카페 골목 초입, 주말 유동인구 많음" : null)}, ${q(seongsu ? "p".repeat(32) : null)}, ${seongsu ? 18 : "NULL"}, 1, ${now - (18 - k) * day});`,
  );
  const picks: string[][] = Array.from({ length: sp.total }, () => []);
  let offset = 0;
  for (const [type, count] of Object.entries(sp.counts)) {
    for (let j = 0; j < count; j++) picks[(offset + j) % sp.total].push(type);
    offset += Math.floor(sp.total / 3);
  }
  for (const [i, types] of picks.entries()) {
    if (types.length > 3) throw new Error(`${sp.slug}: response ${i} has ${types.length} types`);
    const answers: SurveyAnswers = {
      businessTypes: types,
      businessTypeOther: null,
      visitFrequency: VISIT_FREQUENCY[i % VISIT_FREQUENCY.length].value,
      spendRange: SPEND_RANGE[i % SPEND_RANGE.length].value,
      visitTime: VISIT_TIME[i % VISIT_TIME.length].value,
      respondentType: RESPONDENT_TYPE[i % RESPONDENT_TYPE.length].value,
    };
    answersBySlug[sp.slug]?.push(answers);
    out.push(
      `INSERT INTO survey_responses (space_id, answers, device_hash, created_at) VALUES ((SELECT id FROM spaces WHERE slug = ${q(sp.slug)}), ${q(JSON.stringify(answers))}, ${q(`seed-${sp.slug}-${i}`)}, ${now - (i % 14) * day});`,
    );
  }
}

out.push(
  `INSERT INTO survey_contacts (space_id, contact, privacy_consented_at, created_at) VALUES (${space}, 'seed@example.com', ${now - 3 * day}, ${now - 3 * day});`,
);

// Space facts the evaluator input needs (mirrors what buildEvalInput reads from the DB).
const spaceFacts: Record<string, { name: string; neighborhood: string; district: string; locationNotes: string; marginPct: number | null }> = {
  "mangwon-01": { name: "망원동 1층 코너 공실", neighborhood: "마포구 망원동", district: "마포구", locationNotes: "망원시장 입구 도보 2분, 골목 코너 1층, 낮에는 주민·저녁에는 직장인 유동", marginPct: null },
  "seongsu-01": { name: "성수동 골목 1층 공실", neighborhood: "성동구 성수동", district: "성동구", locationNotes: "성수역 3번 출구 도보 4분, 카페 골목 초입, 주말 유동인구 많음", marginPct: 18 },
};

function evalInput(slug: string, a: { type: string; planText: string; cost: number }): EvalInput {
  const answers = answersBySlug[slug];
  const facts = spaceFacts[slug];
  const report = aggregate(answers);
  const estimate = estimateRevenue(answers, matchBusinessType(a.type) ?? "", { scaleFactor: 1, marginPct: facts.marginPct });
  return {
    space: { name: facts.name, neighborhood: facts.neighborhood, district: facts.district, locationNotes: facts.locationNotes },
    survey: {
      total: report.total,
      byType: report.byType,
      spend: distribution(answers, "spendRange", SPEND_RANGE),
      visitTime: distribution(answers, "visitTime", VISIT_TIME),
      frequency: distribution(answers, "visitFrequency", VISIT_FREQUENCY),
      respondents: distribution(answers, "respondentType", RESPONDENT_TYPE),
    },
    estimate: {
      respondents: estimate.respondents,
      revenue: estimate.revenue,
      netProfit: estimate.netProfit,
      marginPct: estimate.marginPct,
      scaleFactor: estimate.scaleFactor,
    },
    application: { businessType: a.type, planText: a.planText, estCostManwon: a.cost },
    attachment: null,
  };
}

type Seeded = {
  slug: string;
  type: string;
  name: string;
  cost: number;
  broker: 0 | 1;
  token: string;
  track: "ssulmo" | "general";
  mailed: boolean;
  /** Stored as a failed evaluation instead of running the evaluator. */
  failed?: string;
};
// Fixed result tokens so the e2e test and manual checks can open result pages:
// mangwon-01 uses a*32, b*32, c*32; seongsu-01 uses the digit repeated 32 times (1*32 ... 8*32).
// 김예시 = 쓸모 트랙; 박예시's result mail stays unsent so the manual tick is demonstrable.
const applications: Seeded[] = [
  { slug: "mangwon-01", type: "젤라또 가게", name: "김예시", cost: 4500, broker: 1, token: "a".repeat(32), track: "ssulmo", mailed: true },
  { slug: "mangwon-01", type: "반찬가게", name: "이예시", cost: 3000, broker: 0, token: "b".repeat(32), track: "general", mailed: true },
  { slug: "mangwon-01", type: "베이커리 카페", name: "박예시", cost: 8000, broker: 1, token: "c".repeat(32), track: "general", mailed: false },
  // seongsu-01: six land at 60+ (5-cap and 더 보기 visible), one below 60, one failed.
  { slug: "seongsu-01", type: "젤라또 가게", name: "최예시", cost: 4800, broker: 1, token: "1".repeat(32), track: "ssulmo", mailed: true },
  { slug: "seongsu-01", type: "아이스크림 전문점", name: "정성수", cost: 6000, broker: 0, token: "2".repeat(32), track: "general", mailed: true },
  { slug: "seongsu-01", type: "소프트아이스크림", name: "한디저트", cost: 3500, broker: 1, token: "3".repeat(32), track: "ssulmo", mailed: false },
  { slug: "seongsu-01", type: "동네 카페", name: "오카페", cost: 5000, broker: 0, token: "4".repeat(32), track: "general", mailed: true },
  { slug: "seongsu-01", type: "커피 로스터리", name: "윤로스터", cost: 7000, broker: 1, token: "5".repeat(32), track: "ssulmo", mailed: false },
  { slug: "seongsu-01", type: "베이커리", name: "송베이커", cost: 4000, broker: 0, token: "6".repeat(32), track: "general", mailed: true },
  { slug: "seongsu-01", type: "로컬 베이커리 카페", name: "백제과", cost: 9000, broker: 0, token: "7".repeat(32), track: "general", mailed: false },
  { slug: "seongsu-01", type: "수제 쿠키", name: "서쿠키", cost: 2500, broker: 0, token: "8".repeat(32), track: "general", mailed: false, failed: "Anthropic API 529" },
];

for (const [i, a] of applications.entries()) {
  const t = now - (applications.length + 2 - i) * day;
  const planText = `${a.type} 사업계획 예시입니다. 주 고객은 동네 주민과 직장인입니다.`;
  const consultingAt = a.track === "ssulmo" ? t : null;
  const common = `${q(a.type)}, ${q(planText)}, NULL, ${a.cost}, ${q(a.name)}, ${q(`seed${i}@example.com`)}`;

  let ai: { status: "done" | "failed"; score: number | null; report: string | null; model: string | null; evaluatedAt: number; error: string | null; verdict: string | null; summary: string | null };
  if (a.failed) {
    ai = { status: "failed", score: null, report: null, model: null, evaluatedAt: t + 60_000, error: a.failed, verdict: null, summary: null };
  } else {
    const { report, model } = await fakeEvaluator.evaluate(evalInput(a.slug, { type: a.type, planText, cost: a.cost }));
    ai = { status: "done", score: report.score, report: JSON.stringify(report), model, evaluatedAt: t + 60_000, error: null, verdict: report.verdict, summary: report.summary };
  }
  out.push(
    `INSERT INTO applications (space_id, result_token, business_type, plan_text, plan_file_key, est_cost_manwon, contact_name, email, consent_privacy_at, consent_intro_terms_at, consent_broker_intro, consent_broker_intro_at, track, consent_ai_at, consent_consulting_at, ai_status, ai_score, ai_report, ai_model, ai_evaluated_at, ai_error, result_verdict, result_summary, result_mailed_at, created_at) VALUES ((SELECT id FROM spaces WHERE slug = ${q(a.slug)}), ${q(a.token)}, ${common}, ${t}, ${t}, ${a.broker}, ${a.broker ? t : "NULL"}, ${q(a.track)}, ${t}, ${q(consultingAt)}, ${q(ai.status)}, ${q(ai.score)}, ${q(ai.report)}, ${q(ai.model)}, ${ai.evaluatedAt}, ${q(ai.error)}, ${q(ai.verdict)}, ${q(ai.summary)}, ${a.mailed && !a.failed ? ai.evaluatedAt + 5_000 : "NULL"}, ${t});`,
  );
}

const byName = (name: string) => `(SELECT id FROM applications WHERE contact_name = '${name}')`;
out.push(
  `INSERT INTO broker_intros (application_id, broker_name, introduced_on, created_at) VALUES (${byName("김예시")}, '망원 예시 공인중개사', '${new Date(now - day).toISOString().slice(0, 10)}', ${now});`,
);

// 최예시 (쓸모 트랙): two reported months with the fee computed by the real rule, plus an educator link.
// TODO(legal): the fee shown here is a record only; nothing is charged.
for (const [month, revenueManwon, profitManwon] of [
  ["2026-12", 1000, 180],
  ["2027-01", 620, -40],
] as const) {
  const revenue = revenueManwon * 10_000;
  const profit = profitManwon * 10_000;
  out.push(
    `INSERT INTO consulting_months (application_id, month, revenue_krw, profit_krw, fee_krw, created_at) VALUES (${byName("최예시")}, '${month}', ${revenue}, ${profit}, ${consultingFee(revenue, profit)}, ${now});`,
  );
}
out.push(
  `INSERT INTO educator_links (application_id, organization, educator_name, connected_on, created_at) VALUES (${byName("최예시")}, '성동구 창업지원센터', '박멘토', '2026-11-03', ${now});`,
);

console.log(out.join("\n"));
