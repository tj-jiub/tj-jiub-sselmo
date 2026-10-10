import { data, Form, Link } from "react-router";
import type { Route } from "./+types/admin-space";
import { requireAdmin } from "~/lib/auth.server";
import { getSpace, parseSpaceSettings, saveSpaceSettings, setOwnerConsent } from "~/lib/spaces.server";
import { listShortlist } from "~/lib/owner.server";
import { getSpaceOwner } from "~/lib/owner-spaces.server";
import { listMarksForSpace } from "~/lib/marks.server";
import { spaceStatusLabel } from "~/lib/space-status";
import { loadSpaceDemand } from "~/lib/revenue.server";
import { formatManwonRange } from "~/lib/money";
import { defaultMargin } from "~/lib/revenue";
import { listAnswers, listContacts } from "~/lib/surveys.server";
import { aggregate, distribution, formatIntent, PUBLIC_THRESHOLD } from "~/lib/report";
import { RESPONDENT_TYPE, SPEND_RANGE, VISIT_FREQUENCY, VISIT_TIME } from "~/lib/survey";
import { QrDownload } from "~/components/QrDownload";
import { btnSmall, btnSmallGhost, ErrorNote, Section, Shell, Title } from "~/components/ui";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const space = await getSpace(env.DB, Number(params.id));
  if (!space) throw new Response("Not found", { status: 404 });
  const answers = await listAnswers(env.DB, space.id);
  return {
    space,
    origin: new URL(request.url).origin,
    report: aggregate(answers),
    breakdowns: [
      { title: "방문 빈도", rows: distribution(answers, "visitFrequency", VISIT_FREQUENCY) },
      { title: "1회 지출", rows: distribution(answers, "spendRange", SPEND_RANGE) },
      { title: "방문 시간대", rows: distribution(answers, "visitTime", VISIT_TIME) },
      { title: "응답자 유형", rows: distribution(answers, "respondentType", RESPONDENT_TYPE) },
    ],
    contacts: await listContacts(env.DB, space.id),
    demand: await loadSpaceDemand(env.DB, space),
    candidates: await listShortlist(env.DB, space.id),
    owner: await getSpaceOwner(env.DB, space.id),
    marks: Object.fromEntries(await listMarksForSpace(env.DB, space.id)),
    photoKeys: space.photo_keys ? (JSON.parse(space.photo_keys) as string[]) : [],
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const form = await request.formData();
  const id = Number(params.id);
  const intent = form.get("intent");
  if (intent === "set-consent") {
    await setOwnerConsent(env.DB, id, form.get("consent") === "1");
  } else if (intent === "save-settings") {
    const parsed = parseSpaceSettings(form);
    if (!parsed.ok) return data({ error: parsed.error, saved: null }, { status: 400 });
    await saveSpaceSettings(env.DB, id, parsed.value);
    return { error: null, saved: "settings" };
  }
  return { error: null, saved: null };
}

const field = "w-full rounded-[10px] border border-line px-3 py-2.5 focus:border-ink focus:outline-none";

export default function AdminSpace({ loaderData, actionData }: Route.ComponentProps) {
  const { space, origin, report, breakdowns, contacts, demand, candidates, owner, marks, photoKeys } = loaderData;
  const consented = space.owner_consent === 1;
  const isPublic = space.status === "active" && consented;
  // Owner-registered spaces go live through the queue on /admin, not through the consent toggle.
  const awaitingApproval = space.owner_id !== null && space.status !== "active";
  const surveyUrl = `${origin}/s/${space.slug}`;
  const est = demand.estimate;

  return (
    <Shell wide nav={false}>
      <Title eyebrow={space.neighborhood}>{space.name}</Title>
      <ErrorNote message={actionData?.error} />

      <Section title="상태">
        <p className="text-base">
          <span className="rounded-full border border-line px-2.5 py-0.5 text-[15px] font-bold">{spaceStatusLabel(space)}</span>
          {space.status === "rejected" && space.reject_reason && <span className="ml-3">반려 사유: {space.reject_reason}</span>}
        </p>
        {owner && (
          <dl className="mt-4 grid grid-cols-[6rem_1fr] gap-y-1.5 text-base">
            <dt className="text-muted">건물주 (개인정보)</dt>
            <dd className="break-all">
              {owner.name ?? "이름 없음"} · {owner.email}
              {owner.phone ? ` · ${owner.phone}` : ""}
            </dd>
            <dt className="text-muted">등록 사진</dt>
            <dd>
              {photoKeys.length === 0
                ? "없음"
                : photoKeys.map((k, i) => (
                    <a key={k} className="mr-3 underline" href={`/admin/files/${k}`}>
                      사진 {i + 1}
                    </a>
                  ))}
            </dd>
          </dl>
        )}
      </Section>

      <div className="grid gap-x-10 md:grid-cols-2">
        <div className="min-w-0">
          <Section title="위치 정보 (AI 평가에 쓰여요)">
            <Form method="post" className="space-y-4 text-base">
              <input type="hidden" name="intent" value="save-settings" />
              <label className="block">
                <span className="mb-1.5 block font-medium">위치 특징</span>
                <textarea name="locationNotes" defaultValue={space.location_notes ?? ""} maxLength={500} className={`${field} min-h-28`} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block font-medium">순이익률 가정 (%)</span>
                  <input name="marginPct" inputMode="numeric" defaultValue={space.margin_pct ?? ""} placeholder="비우면 업종 기본값" className={field} />
                </label>
                <label className="block">
                  <span className="mb-1.5 block font-medium">환산 배수</span>
                  <input name="scaleFactor" inputMode="decimal" defaultValue={space.scale_factor} className={field} />
                </label>
              </div>
              <button className={btnSmall}>저장</button>
              {actionData?.saved === "settings" && <span className="ml-3 text-muted">저장했어요.</span>}
            </Form>
            <div className="mt-6 rounded-[14px] border border-line p-4 text-base">
              <h3 className="mb-2 text-[15px] font-bold text-muted">예상 매출 미리보기 {demand.topType ? `· ${demand.topType.type}` : ""}</h3>
              {est ? (
                <>
                  <p>
                    월 매출 {formatManwonRange(est.revenue)} · 월 순이익 {formatManwonRange(est.netProfit)}
                  </p>
                  <p className="mt-2 text-[15px] text-muted">
                    근거: 응답자 {demand.total}명 중 {est.respondents}명이 고른 업종, 1회 지출·방문 빈도 기준, 순이익률 {est.marginPct}%
                    {space.margin_pct === null ? ` (${demand.topType?.type} 기본값 ${defaultMargin(demand.topType?.type ?? "")}%)` : ""}, 환산 배수 {est.scaleFactor}. 추정치이며 실제 매출을 보장하지 않아요.
                  </p>
                </>
              ) : (
                <p className="text-muted">집계 중이에요. 응답 {PUBLIC_THRESHOLD}건부터 보여요. (현재 {demand.total}건)</p>
              )}
            </div>
          </Section>
        </div>
        <div className="min-w-0">
          <Section title="현재 후보 (60점 이상 상위 5명)">
            {candidates.length === 0 ? (
              <p className="rounded-[10px] border border-dashed border-line p-3 text-base text-muted">아직 후보가 없어요.</p>
            ) : (
              <table className="w-full text-left text-base">
                <thead className="text-[15px] text-muted">
                  <tr>
                    <th className="py-2 font-medium">순위</th>
                    <th className="py-2 font-medium">업종</th>
                    <th className="py-2 font-medium">점수(참고용)</th>
                    <th className="py-2 font-medium">트랙</th>
                    <th className="py-2 font-medium">건물주 ★</th>
                    <th className="py-2 font-medium">건물주 메모 (운영자와 공유)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line tabular-nums">
                  {candidates.map((c) => (
                    <tr key={c.id}>
                      <td className="py-2.5">{c.rank}</td>
                      <td className="py-2.5">
                        <Link to={`/admin/applications/${c.id}`} className="underline-offset-4 hover:underline">
                          {c.businessType}
                        </Link>
                      </td>
                      <td className="py-2.5">{c.score}</td>
                      <td className="py-2.5">{c.track === "ssulmo" ? "쓸모" : "일반"}</td>
                      <td className="py-2.5">{marks[c.id]?.starred ? "★" : "—"}</td>
                      <td className="whitespace-pre-wrap py-2.5">{marks[c.id]?.memo || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        </div>
      </div>

      <Section title="건물주 동의">
        <div className="flex flex-wrap items-center justify-between gap-3 text-base">
          <p>
            {awaitingApproval
              ? `건물주가 직접 등록한 공실이에요. 지금은 ${spaceStatusLabel(space)} 상태라 비공개예요. 공개는 대시보드의 '확인 대기 공실'에서 승인해야 해요.`
              : isPublic
                ? "동의 완료 — 링크가 공개돼 있어요."
                : "동의 전 — 설문·리포트·신청 링크가 모두 비공개예요."}
            {space.consent_file_key && (
              <>
                {" "}
                <a className="underline" href={`/admin/files/${space.consent_file_key}`}>
                  동의서 파일
                </a>
              </>
            )}
          </p>
          {!awaitingApproval && (
            <Form method="post">
              <input type="hidden" name="intent" value="set-consent" />
              <input type="hidden" name="consent" value={consented ? "0" : "1"} />
              <button className={btnSmallGhost}>{consented ? "동의 취소(비공개로)" : "동의 받음(공개하기)"}</button>
            </Form>
          )}
        </div>
      </Section>

      <Section title="QR · 링크">
        <QrDownload url={surveyUrl} filename={`ssulmo-${space.slug}.png`} />
        <ul className="mt-4 space-y-1 text-base break-all">
          <li>설문: {surveyUrl}</li>
          <li>공개 요약: {origin}/r/{space.slug}</li>
          <li>창업 신청: {origin}/apply/{space.slug}</li>
        </ul>
      </Section>

      <Section title={`수요 리포트 · 응답 ${report.total}건`}>
        {report.total < PUBLIC_THRESHOLD && (
          <p className="mb-3 text-[15px] text-muted">
            공개 요약은 응답 {PUBLIC_THRESHOLD}건부터 열려요. (현재 {report.total}건)
          </p>
        )}
        <ul className="divide-y divide-line text-base">
          {report.byType.map((s) => (
            <li key={s.type} className="flex justify-between gap-3 py-2.5">
              <span className="font-medium">{s.type}</span>
              <span>{formatIntent(report.total, s.count)}</span>
            </li>
          ))}
        </ul>
        {report.others.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-2 text-[15px] font-bold text-muted">기타 응답 (원문)</h3>
            <ul className="flex flex-wrap gap-2 text-base">
              {report.others.map((o, i) => (
                <li key={i} className="rounded-full border border-line px-3 py-1">
                  {o}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {breakdowns.map((b) => (
            <div key={b.title}>
              <h3 className="mb-2 text-[15px] font-bold text-muted">{b.title}</h3>
              <ul className="text-base">
                {b.rows.map((r) => (
                  <li key={r.label} className="flex justify-between py-1">
                    <span>{r.label}</span>
                    <span className="tabular-nums">{r.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section title={`소식 받기 연락처 ${contacts.length}건 (개인정보)`}>
        <ul className="text-base">
          {contacts.map((c, i) => (
            <li key={i} className="py-1">
              {c.contact}
            </li>
          ))}
        </ul>
      </Section>

      <Link to="/admin" className="text-base text-muted underline">
        ← 목록으로
      </Link>
    </Shell>
  );
}
