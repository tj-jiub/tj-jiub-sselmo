import type { Route } from "./+types/result";
import { getResultByToken } from "~/lib/applications.server";
import { verdictLabel } from "~/lib/verdicts";
import { SECTION_KEYS, SECTION_LABELS } from "~/lib/ai-report";
import { Card, Shell, Title } from "~/components/ui";

export const meta: Route.MetaFunction = () => [{ title: "평가 결과 — 쓸모" }, { name: "robots", content: "noindex" }];

const OPEN_SECTIONS = 2;

export async function loader({ params, context }: Route.LoaderArgs) {
  const result = await getResultByToken(context.cloudflare.env.DB, params.token);
  if (!result) throw new Response("Not found", { status: 404 });
  const { report, ...rest } = result;
  // The score stays on the server: pick the fields the page shows instead of sending the whole report.
  return {
    ...rest,
    verdictLabel: verdictLabel(result.verdict),
    report: report
      ? {
          strengths: report.strengths,
          risks: report.risks,
          notes: report.notes ?? [],
          sections: SECTION_KEYS.map((k) => ({ key: k, label: SECTION_LABELS[k], text: report.sections[k] })),
        }
      : null,
  };
}

function Bullets({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-bold">{title}</h3>
      <ul className="mt-1.5 list-disc pl-5 text-[15px]">
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

export default function Result({ loaderData }: Route.ComponentProps) {
  const r = loaderData;

  if (!r.ready) {
    return (
      <Shell>
        <Title eyebrow={r.spaceName}>평가 중이에요</Title>
        <p className="text-muted">AI가 사업계획을 살펴보고 있어요. 평가가 끝나면 이 링크에서 결과를 볼 수 있어요.</p>
        <p className="mt-2 text-sm text-muted">잠시 뒤에 이 페이지를 다시 열어 주세요.</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <Title eyebrow={r.spaceName}>{r.contactName}님, 평가가 나왔어요</Title>
      <Card top className="mb-8">
        <p className="text-cap font-bold tracking-wide">{r.verdictLabel}</p>
        <p className="mt-1.5 whitespace-pre-wrap">{r.summary}</p>
      </Card>

      {r.report && (
        <>
          <div className="mb-8 grid gap-5">
            <Bullets title="강점" items={r.report.strengths} />
            <Bullets title="위험" items={r.report.risks} />
          </div>

          <section className="mb-8">
            <h2 className="mb-3 border-b border-ink pb-2 text-sm font-bold">
              상세 리포트 <span className="text-cap font-normal text-muted">· 오픈 베타 기간 무료</span>
            </h2>
            <div className="grid gap-2.5">
              {r.report.sections.map((s, i) => (
                <details key={s.key} open={i < OPEN_SECTIONS} className="rounded-[12px] border border-line px-4 py-3.5">
                  <summary className="cursor-pointer text-sm font-bold">{s.label}</summary>
                  <p className="mt-1.5 whitespace-pre-wrap text-[15px] leading-[1.6]">{s.text}</p>
                </details>
              ))}
            </div>
            {r.report.notes.length > 0 && (
              <ul className="mt-4 list-disc pl-5 text-cap text-muted">
                {r.report.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {/* TODO(legal): 쓸모 트랙 status wording and terms reference need review. */}
      {r.track === "ssulmo" && (
        <p className="mb-4 text-sm text-muted">쓸모 트랙으로 지원하셨어요. 컨설팅 안내는 따로 연락드려요.</p>
      )}
      <p className="text-cap text-muted">AI가 작성한 평가예요. 참고용으로 활용해 주세요.</p>
    </Shell>
  );
}
