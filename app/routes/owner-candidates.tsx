import { useEffect, useRef, useState } from "react";
import { data, useFetcher } from "react-router";
import type { Route } from "./+types/owner-candidates";
import { requireOwner } from "~/lib/owner-auth.server";
import { getOwnedSpace } from "~/lib/owner-spaces.server";
import { getSpaceDemand } from "~/lib/owner.server";
import { listOwnerCandidates, parseMarkForm, saveMark } from "~/lib/marks.server";
import { btnSmall, Hl, Title } from "~/components/ui";
import { OwnerPage, ownerMeta } from "~/components/owner";

export const meta = ownerMeta("임차인 후보");

const notFound = () => new Response("Not found", { status: 404 });
const parseId = (raw: string | undefined) => (raw && /^\d+$/.test(raw) ? Number(raw) : null);

// Marks are saved by fetchers; the list does not need to be re-read after each save.
export function shouldRevalidate({ formMethod, defaultShouldRevalidate }: { formMethod?: string; defaultShouldRevalidate: boolean }) {
  return formMethod && formMethod.toUpperCase() !== "GET" ? false : defaultShouldRevalidate;
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const owner = await requireOwner(request, env);
  const id = parseId(params.id);
  if (id === null) throw notFound();
  const space = await getOwnedSpace(env.DB, owner.id, id);
  if (!space) throw notFound();
  const candidates = await listOwnerCandidates(env.DB, owner.id, id);
  if (!candidates) throw notFound();
  const isPublic = space.status === "active" && space.owner_consent === 1;
  const demand = isPublic ? await getSpaceDemand(env.DB, id) : { ready: false, total: 0, top: [] };
  // Explicit fields only: the whole Space row (tokens, file keys) and any applicant data stay on the server.
  return {
    space: { id: space.id, name: space.name, isPublic },
    demand: { ready: demand.ready, top: demand.top.slice(0, 1).map((t) => ({ type: t.type, phrase: t.phrase })) },
    candidates: candidates.map((c) => ({
      id: c.id,
      rank: c.rank,
      businessType: c.businessType,
      score: c.score,
      summary: c.summary,
      strengths: c.strengths,
      risks: c.risks,
      track: c.track,
      estCostManwon: c.estCostManwon,
      starred: c.starred,
      memo: c.memo,
    })),
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const owner = await requireOwner(request, env);
  const spaceId = parseId(params.id);
  if (spaceId === null || !(await getOwnedSpace(env.DB, owner.id, spaceId))) throw notFound();
  const form = await request.formData();
  const rawId = String(form.get("applicationId") ?? "");
  const applicationId = /^\d+$/.test(rawId) ? Number(rawId) : null;
  if (applicationId === null) throw notFound();
  const parsed = parseMarkForm(form);
  if (!parsed.ok) return data({ ok: false as const, error: parsed.error }, { status: 400 });
  if (!(await saveMark(env.DB, owner.id, applicationId, parsed.value))) throw notFound();
  return { ok: true as const };
}

type Cand = Route.ComponentProps["loaderData"]["candidates"][number];

function MemoBox({ id, initial }: { id: number; initial: string }) {
  const fetcher = useFetcher<typeof action>();
  const [text, setText] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const textRef = useRef(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submit = fetcher.submit;

  const save = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setDirty(false);
    submit({ applicationId: String(id), memo: textRef.current }, { method: "post" });
  };
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const failed = fetcher.state === "idle" && fetcher.data?.ok === false;
  const status = fetcher.state !== "idle" ? "저장 중…" : failed ? "저장하지 못했어요. 저장 버튼을 눌러 주세요." : dirty ? "" : fetcher.data?.ok ? "저장했어요" : "";

  return (
    <div>
      <label htmlFor={`memo-${id}`} className="mb-1.5 mt-3 block text-[15px] font-medium">
        내 메모
      </label>
      <textarea
        id={`memo-${id}`}
        data-testid="memo"
        value={text}
        maxLength={1000 /* = MEMO_MAX (marks.server is server-only) */}
        placeholder="이 후보에 대한 메모"
        onChange={(e) => {
          textRef.current = e.target.value;
          setText(e.target.value);
          setDirty(true);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(save, 800);
        }}
        onBlur={() => dirty && save()}
        className="min-h-24 w-full resize-y rounded-[10px] border border-line bg-soft px-3 py-2.5 text-base focus:border-ink focus:outline-none"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <span role="status" data-testid="memo-status" className="text-[15px] text-muted">
          {status}
        </span>
        <button type="button" onClick={save} className={btnSmall}>
          저장
        </button>
      </div>
    </div>
  );
}

function StarButton({ id, starred, onChange }: { id: number; starred: boolean; onChange: (next: boolean) => void }) {
  const fetcher = useFetcher<typeof action>();
  // Optimistic: while the POST is in flight the pending form value wins.
  const shown = fetcher.formData ? fetcher.formData.get("starred") === "1" : starred;
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok === false) onChange(!starred);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);
  return (
    <button
      type="button"
      aria-pressed={shown}
      data-testid="star"
      onClick={() => {
        onChange(!shown);
        fetcher.submit({ applicationId: String(id), starred: shown ? "0" : "1" }, { method: "post" });
      }}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-base ${shown ? "border-yellow-deep bg-yellow font-bold" : "border-line bg-paper"}`}
    >
      {shown ? "★" : "☆"} 관심
    </button>
  );
}

function CandidateCard({ c, starred, hidden, onStar }: { c: Cand; starred: boolean; hidden: boolean; onStar: (next: boolean) => void }) {
  return (
    <li data-testid="candidate-card" hidden={hidden} className="grid gap-4 border-t border-line py-6 last:border-b lg:grid-cols-[56px_1fr_300px] lg:gap-6 lg:py-7">
      <p className="num hidden pt-1 text-[15px] text-muted lg:block">{String(c.rank).padStart(2, "0")}</p>
      <div>
        <h2 className="flex flex-wrap items-baseline gap-x-3 text-[22px] font-bold">
          <span className="num mr-0.5 text-[15px] font-normal text-muted lg:hidden">{String(c.rank).padStart(2, "0")}</span>
          {c.businessType}
          <span className="text-base font-medium">
            <span className="num text-lg">{c.score}</span>점 <span className="font-normal text-muted">· 참고용</span>
          </span>
        </h2>
        <p className="mt-2 text-[17px]">{c.summary}</p>
        {(c.strengths.length > 0 || c.risks.length > 0) && (
          <p className="mt-2.5 text-base">
            {c.strengths.length > 0 && (
              <>
                <b>강점</b> {c.strengths.join(", ")}
              </>
            )}
            {c.strengths.length > 0 && c.risks.length > 0 && <br />}
            {c.risks.length > 0 && (
              <>
                <b>위험</b> {c.risks.join(", ")}
              </>
            )}
          </p>
        )}
        <p className="mt-2 text-[15px] text-muted">
          {c.track === "ssulmo" ? "쓸모 트랙" : "일반 신청"} · 예상 창업 비용 <span className="num">{c.estCostManwon.toLocaleString("ko-KR")}</span>만원
        </p>
      </div>
      <div>
        <StarButton id={c.id} starred={starred} onChange={onStar} />
        <MemoBox id={c.id} initial={c.memo} />
      </div>
    </li>
  );
}

export default function OwnerCandidates({ loaderData }: Route.ComponentProps) {
  const { space, demand, candidates } = loaderData;
  const [stars, setStars] = useState(() => new Map(candidates.map((c) => [c.id, c.starred])));
  const [filter, setFilter] = useState<"all" | "starred">("all");
  const starredCount = candidates.filter((c) => stars.get(c.id)).length;

  const demandLine =
    demand.ready && demand.top[0] ? `동네 수요 1위 ${demand.top[0].type} · ${demand.top[0].phrase}` : "동네 수요: 집계 중";

  return (
    <OwnerPage wide>
      <Title
        eyebrow={`${space.name} · 임차인 후보`}
        sub={demandLine}
      >
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
        <p data-testid="candidates-empty" className="rounded-[10px] border border-line bg-soft px-4 py-5 text-base">
          {space.isPublic
            ? "아직 평가가 끝난 후보가 없어요. 지원자가 생기면 AI가 평가해서 이곳에 보여드려요."
            : "아직 공개 전이라 후보가 없어요. 운영자가 확인해서 공개하면 주민 의견을 모으고, 창업자 지원이 들어오면 이곳에 후보가 나타나요."}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ["all", `전체 ${candidates.length}`],
                ["starred", `관심 ${starredCount}`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                data-testid={`chip-${key}`}
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
                className={`min-h-11 rounded-full border px-4 text-base ${filter === key ? "border-ink bg-ink font-medium text-paper" : "border-line bg-paper"}`}
              >
                {label}
              </button>
            ))}
            <p className="w-full text-[15px] text-muted lg:ml-3 lg:w-auto">메모는 운영자와 공유돼요.</p>
          </div>
          {filter === "starred" && starredCount === 0 && (
            <p className="mt-6 text-base text-muted">관심 표시한 후보가 없어요. 후보 카드의 ☆ 관심을 눌러 보세요.</p>
          )}
          {/* Filtered cards stay mounted (hidden) so an unsaved memo is never lost when switching chips. */}
          <ul className="mt-5">
            {candidates.map((c) => (
              <CandidateCard
                key={c.id}
                c={c}
                starred={stars.get(c.id) ?? false}
                hidden={filter === "starred" && !stars.get(c.id)}
                onStar={(next) => setStars((m) => new Map(m).set(c.id, next))}
              />
            ))}
          </ul>
        </>
      )}
      {/* TODO(legal): wording of this notice (AI-written evaluation, contract via licensed broker, no fee for introductions) needs review. */}
      <p className="mt-8 border-t border-line pt-4 text-[15px] text-muted">
        AI가 작성한 평가예요. 이름과 연락처는 계약 협의 단계에서 공인중개사를 통해 안내돼요. 임대차 계약은 건물주님과 공인중개사가 직접 진행하고, 쓸모는 소개에 대한 수수료나 계약의 대가를 받지 않아요.
      </p>
    </OwnerPage>
  );
}
