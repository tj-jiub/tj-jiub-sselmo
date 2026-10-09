import type { Route } from "./+types/owner";
import { getOwnerView, type Candidate } from "~/lib/owner.server";
import { ContinuousPage, FocusRow, Hero, Notice, Say, SplitList } from "~/components/motion";
import { Hl } from "~/components/ui";

export const meta: Route.MetaFunction = () => [{ title: "임차인 후보 평가 — 쓸모" }, { name: "robots", content: "noindex" }];

// getOwnerView selects explicit columns only: no name, email or plan text reach this page.
export async function loader({ params, context }: Route.LoaderArgs) {
  const view = await getOwnerView(context.cloudflare.env.DB, params.token);
  if (!view) throw new Response("Not found", { status: 404 });
  return view;
}


function CandidateRow({ c }: { c: Candidate }) {
  return (
    <FocusRow
      rank={String(c.rank).padStart(2, "0")}
      title={c.businessType}
      phrase={
        <>
          <span className="num">{c.score}</span>점 <span className="text-[15px] font-normal text-muted">참고용</span>
        </>
      }
      pct={c.score}
    >
      <p className="detail">{c.summary}</p>
      {(c.strengths.length > 0 || c.risks.length > 0) && (
        <p className="detail">
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
      )}
      <p className="sub">
        {c.track === "ssulmo" ? "쓸모 트랙" : "일반 신청"} · 예상 비용 <span className="num">{c.estCostManwon.toLocaleString("ko-KR")}</span>만원
      </p>
    </FocusRow>
  );
}

export default function Owner({ loaderData }: Route.ComponentProps) {
  const { space, demand, candidates } = loaderData;

  const demandLine = demand.ready
    ? `동네 수요: ${demand.top.map((t, i) => (i === 0 ? `1위 ${t.type}(${t.phrase})` : `${i + 1}위 ${t.type}`)).join(" · ")}`
    : "동네 수요: 집계 중";

  return (
    <ContinuousPage nav="minimal">
      <Hero
        label={`${space.name} · 임차인 후보`}
        title={
          candidates.length > 0 ? (
            <>
              AI 평가 상위 <Hl>후보 {candidates.length}명</Hl>
            </>
          ) : (
            <>
              AI 평가 <Hl>상위 후보</Hl>
            </>
          )
        }
        lead={demandLine}
      />
      <Say label="쓸모가 하는 일" text="동네 주민들이 원하는 가게를 기준으로, 이 자리에 어울리는 임차인 후보를 AI가 먼저 살펴봤어요." />
      <SplitList label="후보 평가" title="후보별 평가" text="점수는 참고용이에요. 최종 판단은 건물주님이 하세요.">
        {candidates.length === 0 ? (
          <p className="cp-p">아직 평가가 끝난 후보가 없어요.</p>
        ) : (
          candidates.map((c) => <CandidateRow key={c.id} c={c} />)
        )}
      </SplitList>
      {/* TODO(legal): owner-page notice wording needs review. */}
      <Notice>
        AI가 작성한 평가예요. 임대차 계약은 건물주님과 공인중개사가 직접 진행해요. 쓸모는 계약에 참여하지 않고, 계약의 대가를 받지 않아요.
      </Notice>
    </ContinuousPage>
  );
}
