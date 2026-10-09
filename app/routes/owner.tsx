import type { Route } from "./+types/owner";
import { getOwnerView, type Candidate } from "~/lib/owner.server";
import { Hl, Shell, Title } from "~/components/ui";

export const meta: Route.MetaFunction = () => [{ title: "임차인 후보 평가 — 쓸모" }, { name: "robots", content: "noindex" }];

const FIRST_PAGE = 3;

// getOwnerView selects explicit columns only: no name, email or plan text reach this page.
export async function loader({ params, context }: Route.LoaderArgs) {
  const view = await getOwnerView(context.cloudflare.env.DB, params.token);
  if (!view) throw new Response("Not found", { status: 404 });
  return view;
}

const won = (manwon: number) => `${manwon.toLocaleString("ko-KR")}만원`;

function CandidateCard({ c }: { c: Candidate }) {
  return (
    <article className={`rounded-[14px] border p-[18px] lg:px-5 ${c.rank === 1 ? "border-green-deep" : "border-line"} bg-paper`}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[17px] font-bold">
          후보 {c.rank} · {c.businessType}
        </h3>
        <p className="font-bold tabular-nums">
          {c.score}
          <small className="ml-[3px] text-cap font-normal text-muted">참고용</small>
        </p>
      </div>
      <p className="mt-2 text-sm leading-[1.6]">{c.summary}</p>
      <p className="mt-2.5 text-[15px] leading-[1.6]">
        {c.strengths.length > 0 && (
          <>
            <b>강점</b> {c.strengths.join(", ")}
            <br />
          </>
        )}
        {c.risks.length > 0 && (
          <>
            <b>위험</b> {c.risks.join(", ")}
          </>
        )}
      </p>
      <p className="mt-2.5 text-cap text-muted">
        {c.track === "ssulmo" ? "쓸모 트랙" : "일반 신청"} · 예상 비용 {won(c.estCostManwon)}
      </p>
    </article>
  );
}

const grid = "grid gap-3.5 lg:grid-cols-3";

export default function Owner({ loaderData }: Route.ComponentProps) {
  const { space, demand, candidates } = loaderData;
  const first = candidates.slice(0, FIRST_PAGE);
  const rest = candidates.slice(FIRST_PAGE);

  const demandLine = demand.ready
    ? `동네 수요: ${demand.top.map((t, i) => (i === 0 ? `1위 ${t.type}(${t.phrase})` : `${i + 1}위 ${t.type}`)).join(" · ")}`
    : "동네 수요: 집계 중";

  return (
    <Shell wide nav="minimal">
      <Title eyebrow={`${space.name} · 임차인 후보`} sub={demandLine}>
        {candidates.length > 0 ? (
          <>
            AI 평가 상위 <Hl>후보 {candidates.length}명</Hl>
          </>
        ) : (
          <>
            AI 평가 <Hl>상위 후보</Hl>
          </>
        )}
      </Title>

      {candidates.length === 0 ? (
        <p className="rounded-[14px] border border-dashed border-line px-6 py-5 text-muted">아직 평가가 끝난 후보가 없어요.</p>
      ) : (
        <>
          <div className={grid}>
            {first.map((c) => (
              <CandidateCard key={c.id} c={c} />
            ))}
          </div>
          {rest.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-[15px] text-muted underline underline-offset-4">
                후보 {rest.map((c) => c.rank).join("·")} 더 보기
              </summary>
              <div className={`${grid} mt-3.5`}>
                {rest.map((c) => (
                  <CandidateCard key={c.id} c={c} />
                ))}
              </div>
            </details>
          )}
        </>
      )}

      {/* TODO(legal): owner-page notice wording needs review. */}
      <p className="mt-6 border-t border-line pt-3.5 text-[15px] text-muted">
        AI가 작성한 평가예요. 임대차 계약은 건물주님과 공인중개사가 직접 진행해요. 쓸모는 계약에 참여하지 않고, 계약의 대가를 받지 않아요.
      </p>
    </Shell>
  );
}
