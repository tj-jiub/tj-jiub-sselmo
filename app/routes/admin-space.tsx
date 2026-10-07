import { Form, Link } from "react-router";
import type { Route } from "./+types/admin-space";
import { requireAdmin } from "~/lib/auth.server";
import { getSpace, setOwnerConsent } from "~/lib/spaces.server";
import { listAnswers, listContacts } from "~/lib/surveys.server";
import { aggregate, distribution, formatIntent, PUBLIC_THRESHOLD } from "~/lib/report";
import { RESPONDENT_TYPE, SPEND_RANGE, VISIT_FREQUENCY, VISIT_TIME } from "~/lib/survey";
import { QrDownload } from "~/components/QrDownload";
import { Section, Shell, Title } from "~/components/ui";

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
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const form = await request.formData();
  if (form.get("intent") === "set-consent") {
    await setOwnerConsent(env.DB, Number(params.id), form.get("consent") === "1");
  }
  return null;
}

export default function AdminSpace({ loaderData }: Route.ComponentProps) {
  const { space, origin, report, breakdowns, contacts } = loaderData;
  const consented = space.owner_consent === 1;
  const surveyUrl = `${origin}/s/${space.slug}`;

  return (
    <Shell wide>
      <Title eyebrow={space.neighborhood}>{space.name}</Title>

      <Section title="건물주 동의">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p>
            {consented ? "동의 완료 — 링크가 공개돼 있어요." : "동의 전 — 설문·리포트·신청 링크가 모두 비공개예요."}
            {space.consent_file_key && (
              <>
                {" "}
                <a className="underline" href={`/admin/files/${space.consent_file_key}`}>
                  동의서 파일
                </a>
              </>
            )}
          </p>
          <Form method="post">
            <input type="hidden" name="intent" value="set-consent" />
            <input type="hidden" name="consent" value={consented ? "0" : "1"} />
            <button className="rounded-lg border border-ink px-3 py-1.5">
              {consented ? "동의 취소(비공개로)" : "동의 받음(공개하기)"}
            </button>
          </Form>
        </div>
      </Section>

      <Section title="QR · 링크">
        <QrDownload url={surveyUrl} filename={`ssulmo-${space.slug}.png`} />
        <ul className="mt-4 space-y-1 text-sm break-all">
          <li>설문: {surveyUrl}</li>
          <li>공개 요약: {origin}/r/{space.slug}</li>
          <li>창업 신청: {origin}/apply/{space.slug}</li>
        </ul>
      </Section>

      <Section title={`수요 리포트 · 응답 ${report.total}건`}>
        {report.total < PUBLIC_THRESHOLD && (
          <p className="mb-3 text-xs text-muted">
            공개 요약은 응답 {PUBLIC_THRESHOLD}건부터 열려요. (현재 {report.total}건)
          </p>
        )}
        <ul className="divide-y divide-line text-sm">
          {report.byType.map((s) => (
            <li key={s.type} className="flex justify-between gap-3 py-2.5">
              <span className="font-medium">{s.type}</span>
              <span>{formatIntent(report.total, s.count)}</span>
            </li>
          ))}
        </ul>
        {report.others.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-2 text-xs font-semibold text-muted">기타 응답 (원문)</h3>
            <ul className="flex flex-wrap gap-2 text-sm">
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
              <h3 className="mb-2 text-xs font-semibold text-muted">{b.title}</h3>
              <ul className="text-sm">
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
        <ul className="text-sm">
          {contacts.map((c, i) => (
            <li key={i} className="py-1">
              {c.contact}
            </li>
          ))}
        </ul>
      </Section>

      <Link to="/admin" className="text-sm text-muted underline">
        ← 목록으로
      </Link>
    </Shell>
  );
}
