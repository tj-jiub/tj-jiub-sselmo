import type { Route } from "./+types/public-report";
import { getPublicSpace } from "~/lib/spaces.server";
import { listAnswers } from "~/lib/surveys.server";
import { aggregate, formatIntent } from "~/lib/report";
import { loadSpaceDemand } from "~/lib/revenue.server";
import { formatManwonRange } from "~/lib/money";
import { estimateBasis, recruitHeadline } from "~/lib/screen-copy";
import { FEE_RATE } from "~/lib/consulting";
import { ContinuousPage, Cta, FocusRow, Hero, Say, SplitList, StackCard, StackSection, Stats } from "~/components/motion";

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
    total: report.total,
    intent: formatIntent(demand.total, topType.count),
    lines: report.byType.map((s) => ({ type: s.type, text: formatIntent(report.total, s.count), count: s.count, total: report.total })),
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
      <ContinuousPage nav="minimal" smooth={false}>
        <Hero label={`${d.neighborhood} · 창업자 모집`} title={d.name} lead="집계 중이에요. 주민 응답이 충분히 모이면 이 자리에 필요한 가게를 보여드려요." />
      </ContinuousPage>
    );
  }

  return (
    <ContinuousPage nav="minimal">
      <Hero
        label={`${d.neighborhood} · 창업자 모집`}
        title={
          <>
            {d.headline.before}
            <mark className="cp-hl">{d.headline.word}</mark>
            {d.headline.after}
          </>
        }
        lead={d.name}
        meta={[d.intent]}
      />

      <Say label="쓸모가 하는 일" text="가게 앞 QR로 모은 주민들의 목소리로, 비어 있는 이 자리에 꼭 맞는 가게와 사장님을 찾아요." />

      <SplitList n="01" label="동네 수요" title="동네가 원하는 가게" text="주민 응답을 업종별로 모았어요.">
        {d.lines.map((l) => (
          <FocusRow key={l.type} title={l.type} phrase={l.text} pct={l.total > 0 ? (l.count / l.total) * 100 : 0} />
        ))}
      </SplitList>

      <StackSection n="02" label="지원 전에 확인하세요" title="예상 매출, 조건, 진행 순서">
        {d.estimate && (
          <StackCard tag="A · 예상 매출" title="예상 월매출" top>
            <p className="big">{d.estimate.revenue}</p>
            <p className="cp-p" style={{ marginTop: 12 }}>
              예상 월 순수익
            </p>
            <p className="big">{d.estimate.netProfit}</p>
            <p className="basis">{d.estimate.basis}</p>
            {/* TODO(legal): estimate disclaimer wording needs review. */}
            <p className="warn">추정치이며 실제 매출을 보장하지 않아요.</p>
          </StackCard>
        )}
        {/* TODO(legal): 쓸모 트랙 terms wording needs review. */}
        <StackCard
          tag="B · 쓸모 트랙"
          title={
            <>
              손해 본 달은 0원,
              <br />
              번 달만 매출의 {d.feePct}%
            </>
          }
        >
          <ul>
            {["AI 사업성 평가 리포트 무료", "건물주 후보로 추천", "“주민이 선택한 가게” 인증", "창업 컨설팅과 주민 오픈 알림"].map((t, i) => (
              <li key={t}>
                <span className="n">{String(i + 1).padStart(2, "0")}</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </StackCard>
        <StackCard tag="C · 진행 순서" title="신청부터 계약까지">
          <ul>
            {["신청", "상위 후보 5명을 건물주에게 소개", "계약은 건물주와 공인중개사가 직접"].map((t, i) => (
              <li key={t}>
                <span className="n">{String(i + 1).padStart(2, "0")}</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </StackCard>
      </StackSection>

      <Stats
        items={[
          { value: `${d.total}명`, label: "응답한 주민" },
          { value: `${d.lines.length}개`, label: "응답에 나온 업종" },
          { value: `${d.lines[0].count}명`, label: `${d.lines[0].type} 이용 의향` },
        ]}
      />

      <Cta label="지원하기" title="이 자리에서 가게를 열어 볼래요?" text="일반 신청도 똑같이 AI 평가를 받아요." to={`/apply/${d.slug}`} action="무료로 지원하기 →" />
    </ContinuousPage>
  );
}
