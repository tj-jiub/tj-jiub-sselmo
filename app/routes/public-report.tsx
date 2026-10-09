import { Link } from "react-router";
import type { Route } from "./+types/public-report";
import { getPublicSpace } from "~/lib/spaces.server";
import { listAnswers } from "~/lib/surveys.server";
import { aggregate, formatIntent } from "~/lib/report";
import { loadSpaceDemand } from "~/lib/revenue.server";
import { formatManwonRange } from "~/lib/money";
import { estimateBasis, recruitHeadline } from "~/lib/screen-copy";
import { FEE_RATE } from "~/lib/consulting";
import { btnPrimary, Card, Hl, Shell, Title } from "~/components/ui";

export const meta: Route.MetaFunction = ({ data }) => [{ title: data ? `${data.name} 창업자 모집 — 쓸모` : "쓸모" }];

export async function loader({ params, context }: Route.LoaderArgs) {
  const db = context.cloudflare.env.DB;
  const space = await getPublicSpace(db, params.slug);
  if (!space) throw new Response("Not found", { status: 404 });
  const header = { name: space.name, neighborhood: space.neighborhood, slug: space.slug, feePct: Math.round(FEE_RATE * 100) };
  const demand = await loadSpaceDemand(db, space);
  // Below the threshold, send nothing but the header: not even the count.
  if (!demand.ready || !demand.topType) return { ...header, ready: false as const };
  const report = aggregate(await listAnswers(db, space.id));
  const { topType, estimate } = demand;
  return {
    ...header,
    ready: true as const,
    headline: recruitHeadline(topType.type, topType.count),
    intent: formatIntent(demand.total, topType.count),
    lines: report.byType.map((s) => ({ type: s.type, text: formatIntent(report.total, s.count) })),
    estimate: estimate
      ? {
          revenue: formatManwonRange(estimate.revenue),
          netProfit: formatManwonRange(estimate.netProfit),
          basis: estimateBasis(topType.type, estimate),
        }
      : null,
  };
}

export default function PublicReport({ loaderData }: Route.ComponentProps) {
  const d = loaderData;

  if (!d.ready) {
    return (
      <Shell wide>
        <Title eyebrow={`${d.neighborhood} · 창업자 모집`}>
          {d.name}, <Hl>동네가 원하는 가게</Hl>
        </Title>
        <Card className="py-16 text-center">
          <p className="text-h3 font-bold">집계 중</p>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell wide>
      <div className="split">
        <div>
          <Title eyebrow={`${d.neighborhood} · 창업자 모집`} sub={`${d.name} · ${d.intent}`}>
            {d.headline.before}
            <Hl>{d.headline.word}</Hl>
            {d.headline.after}
          </Title>

          {d.estimate && (
            <section className="mb-8 rounded-[14px] border border-line bg-soft p-5 lg:p-6">
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <p className="text-cap text-muted">예상 월매출</p>
                  <p className="text-h3 font-bold tabular-nums leading-[1.3]">{d.estimate.revenue}</p>
                </div>
                <div>
                  <p className="text-cap text-muted">예상 월 순수익</p>
                  <p className="text-h3 font-bold tabular-nums leading-[1.3]">{d.estimate.netProfit}</p>
                </div>
              </div>
              <p className="mt-4 text-cap leading-[1.6] text-muted">{d.estimate.basis}</p>
              {/* TODO(legal): estimate disclaimer wording needs review. */}
              <p className="mt-1.5 text-cap font-medium">추정치이며 실제 매출을 보장하지 않아요.</p>
            </section>
          )}

          <h2 className="mb-3 border-b border-ink pb-2 text-sm font-bold">동네가 원하는 가게</h2>
          <ul className="grid gap-3">
            {d.lines.map((l, i) => (
              <li key={l.type}>
                <Card top={i === 0} className="!py-3.5">
                  <p className="text-lg font-bold">{l.type}</p>
                  <p className="mt-1 text-[15px]">{l.text}</p>
                </Card>
              </li>
            ))}
          </ul>
        </div>

        <aside>
          {/* TODO(legal): 쓸모 트랙 terms wording needs review. */}
          <div className="rounded-[14px] border border-green-deep p-5 lg:p-6">
            <p className="text-cap text-muted">쓸모 트랙으로 지원하면</p>
            <p className="mt-1 text-xl font-bold">
              손해 본 달은 0원,
              <br />
              번 달만 매출의 {d.feePct}%
            </p>
            <ul className="mt-3 list-disc pl-[18px] text-[15px]">
              <li>AI 사업성 평가 리포트 무료</li>
              <li>건물주 후보로 추천</li>
              <li>“주민이 선택한 가게” 인증</li>
              <li>창업 컨설팅과 주민 오픈 알림</li>
            </ul>
          </div>
          <Link to={`/apply/${d.slug}`} className={`${btnPrimary} mt-5 w-full lg:w-auto`}>
            무료로 지원하기 →
          </Link>
          <p className="mt-2.5 text-cap text-muted">일반 신청도 똑같이 AI 평가를 받아요.</p>
        </aside>
      </div>
    </Shell>
  );
}
