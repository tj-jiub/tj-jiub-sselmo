import type { ReactNode } from "react";
import { Link } from "react-router";
import { BUSINESS_CATEGORIES } from "~/lib/survey";
import {
  ANY_DISTRICT,
  headlineWord,
  objectParticle,
  type DistrictMatch,
  type PendingSpace,
  type TypeMatch,
} from "~/lib/matching";
import { ContinuousPage, FocusRow, FocusSteps, Hero, SplitList, StepPanel } from "~/components/motion";
import { Hl } from "~/components/ui";

const STEP_LABELS = ["1 · 아이템", "2 · 고르기", "3 · 추천 공실"];

export function Steps({ current, pick }: { current: 1 | 2 | 3; pick?: "업종" | "지역" }) {
  const labels = [STEP_LABELS[0], pick ? `2 · ${pick}` : STEP_LABELS[1], STEP_LABELS[2]];
  return (
    <ol className="in mb-8 flex gap-2 text-[15px] text-muted" aria-label="진행 단계">
      {labels.map((label, i) => {
        const n = i + 1;
        const tone = n < current ? "border-green-deep text-ink" : n === current ? "border-ink font-bold text-ink" : "border-line";
        return (
          <li key={label} aria-current={n === current ? "step" : undefined} className={`flex-1 border-b-2 pb-1.5 ${tone}`}>
            {label}
          </li>
        );
      })}
    </ol>
  );
}

const chipClass =
  "inline-flex items-baseline gap-2 rounded-full border border-line px-5 py-2.5 text-[17px] hover:border-ink focus-visible:outline-2";

// Question steps: one question per screen (FocusSteps/StepPanel, docs/mockup-v9-focus.html).
// The type question has more options than fit one screen without a nested scroller, so the
// question is its own panel and each category group follows as one more panel (every link
// stays a plain, keyboard-reachable link; focusing one scrolls its panel into view).
function Question({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <>
      <div className="in cp-label">공실 찾기</div>
      <h1 className="in mt-4">{children}</h1>
      {sub && <p className="in cp-p mt-4">{sub}</p>}
    </>
  );
}

export function StartStep() {
  const choices = [
    { to: "?item=yes", title: "네, 정했어요", desc: "업종을 고르면, 그 업종을 원한다고 답한 동네의 공실을 보여드려요." },
    { to: "?item=no", title: "아직이에요", desc: "원하는 지역을 고르면, 그곳 공실과 동네가 가장 원하는 업종을 알려드려요." },
  ];
  return (
    <div className="cp">
      <FocusSteps>
        <StepPanel>
          <Steps current={1} />
          <Question>사업 아이템이 정해졌나요?</Question>
          <div className="in mt-8 grid gap-3">
            {choices.map((c) => (
              <Link key={c.to} to={c.to} className="block rounded-[14px] border border-line p-5 hover:border-ink focus-visible:outline-2">
                <b className="block text-xl">{c.title}</b>
                <span className="mt-1 block text-[15px] text-muted">{c.desc}</span>
              </Link>
            ))}
          </div>
        </StepPanel>
      </FocusSteps>
    </div>
  );
}

export function TypeStep() {
  return (
    <div className="cp">
      <FocusSteps>
        <StepPanel>
          <Steps current={2} pick="업종" />
          <Question sub="아래로 내리면 업종이 나와요.">어떤 가게를 하려고 하나요?</Question>
          <BackLink to="/find" />
        </StepPanel>
        {BUSINESS_CATEGORIES.map((cat) => (
          <StepPanel key={cat.name}>
            <section>
              <h2 className="in">{cat.name}</h2>
              <div className="in mt-6 flex flex-wrap gap-2.5">
                {cat.types.map((t) => (
                  <Link key={t} to={`?item=yes&type=${encodeURIComponent(t)}`} className={chipClass}>
                    {t}
                  </Link>
                ))}
              </div>
            </section>
          </StepPanel>
        ))}
      </FocusSteps>
    </div>
  );
}

export function DistrictStep({ districts }: { districts: Array<{ district: string; count: number }> }) {
  return (
    <div className="cp">
      <FocusSteps>
        <StepPanel>
          <Steps current={2} pick="지역" />
          <Question sub="공실이 등록된 구만 보여드려요.">선호하는 지역이 있나요?</Question>
          {districts.length === 0 && <p className="in cp-p mt-6">지금 의견을 모으는 공실이 없어요.</p>}
          <div className="in mt-8 flex flex-wrap gap-2.5">
            {districts.map((d) => (
              <Link key={d.district} to={`?item=no&district=${encodeURIComponent(d.district)}`} className={chipClass}>
                {d.district}
                <span className="text-[15px] text-muted"><span className="num">{d.count}</span>곳</span>
              </Link>
            ))}
            {districts.length > 0 && (
              <Link to={`?item=no&district=${ANY_DISTRICT}`} className={chipClass}>
                상관없어요
              </Link>
            )}
          </div>
          <BackLink to="/find" />
        </StepPanel>
      </FocusSteps>
    </div>
  );
}

function BackLink({ to }: { to: string }) {
  return (
    <p className="in mt-10">
      <Link to={to} className="text-[15px] text-muted underline underline-offset-4">
        ← 이전
      </Link>
    </p>
  );
}

function RowActions({ slug, type }: { slug: string; type: string | null }) {
  const apply = type ? `/apply/${slug}?type=${encodeURIComponent(type)}` : `/apply/${slug}`;
  return (
    <div className="mt-5 flex flex-wrap gap-3 text-[15px]">
      <Link to={`/r/${slug}`} className="rounded-lg border border-ink px-4 py-2.5 text-center font-semibold">
        동네 의견 보기
      </Link>
      <Link to={apply} className="rounded-lg bg-ink px-4 py-2.5 text-center font-semibold text-paper">
        {type ? "이 업종으로 지원해보기" : "지원해보기"}
      </Link>
    </div>
  );
}

function Pending({ spaces, type }: { spaces: PendingSpace[]; type: string | null }) {
  if (spaces.length === 0) return null;
  return (
    <section className="cp-wrap pb-10">
      <div className="rounded-xl border border-dashed border-line bg-soft p-5 text-[15px]">
        <b>집계 중인 공실 {spaces.length}곳</b>
        <ul className="mt-2 grid gap-2">
          {spaces.map((s) => (
            <li key={s.slug} className="text-muted">
              {s.neighborhood} · {s.name} — 의견이 50명이 모이면 숫자를 보여드려요.{" "}
              <Link to={type ? `/apply/${s.slug}?type=${encodeURIComponent(type)}` : `/apply/${s.slug}`} className="underline">
                그래도 지원하기
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <section className="cp-wrap pb-10">
      <div className="rounded-xl border border-line bg-soft p-5 text-[15px] text-muted">
        {children}
        <p className="mt-3">
          <Link to="/find" className="font-semibold text-ink underline">
            처음부터 다시 찾기
          </Link>
        </p>
      </div>
    </section>
  );
}

function Back({ to }: { to: string }) {
  return (
    <section className="cp-wrap pb-24">
      <Link to={to} className="text-[15px] text-muted underline underline-offset-4">
        ← 이전
      </Link>
    </section>
  );
}

export function TypeResults({ type, ranked, pending }: { type: string; ranked: TypeMatch[]; pending: PendingSpace[] }) {
  return (
    <ContinuousPage>
      <Hero
        label={`${type} · 추천 공실`}
        title={
          ranked.length > 0
            ? `${type}${objectParticle(type)} 원하는 동네가 ${ranked.length}곳 있어요`
            : `${type}${objectParticle(type)} 원하는 의견이 모인 공실이 아직 없어요`
        }
        lead={ranked.length > 0 ? "이 업종을 고른 주민이 많은 순서예요." : undefined}
      />
      {ranked.length > 0 && (
        <SplitList label="추천 공실" title="주민이 원하는 순서" text="응답한 주민 수를 그대로 보여드려요.">
          {ranked.map((m) => (
            <FocusRow
              key={m.slug}
              rank={String(m.rank).padStart(2, "0")}
              title={m.name}
              phrase={
                <>
                  {type} · {m.phrase}
                </>
              }
              pct={m.total > 0 ? Math.round((m.count / m.total) * 100) : 0}
            >
              <p className="sub">{m.neighborhood}</p>
              <RowActions slug={m.slug} type={type} />
            </FocusRow>
          ))}
        </SplitList>
      )}
      {ranked.length === 0 && pending.length === 0 && <Empty>다른 업종을 골라 보거나, 지역으로 먼저 찾아볼 수 있어요.</Empty>}
      <Pending spaces={pending} type={type} />
      <Back to="/find?item=yes" />
    </ContinuousPage>
  );
}

export function DistrictResults({
  district,
  ranked,
  pending,
}: {
  district: string;
  ranked: DistrictMatch[];
  pending: PendingSpace[];
}) {
  const scope = district === ANY_DISTRICT ? "전체 지역" : district;
  const lead = ranked[0] ? headlineWord(ranked[0].top.type) : null;
  return (
    <ContinuousPage>
      <Hero
        label={`${scope} · 추천 공실`}
        title={
          lead ? (
            <>
              {district === ANY_DISTRICT ? "의견이 모인 공실에는" : `${district}에는`} <Hl>{lead}</Hl>
              {objectParticle(lead)} 원하는 공실이 있어요
            </>
          ) : (
            `${scope}에는 아직 숫자를 보여드릴 공실이 없어요`
          )
        }
      />
      {ranked.length > 0 && (
        <SplitList label="추천 공실" title="공실별 1위 업종" text="공실마다 주민이 가장 원하는 업종이에요.">
          {ranked.map((m) => (
            <FocusRow
              key={m.slug}
              title={m.name}
              phrase={
                <>
                  <span>1위 {m.top.type}</span> · {m.phrase}
                </>
              }
              pct={m.total > 0 ? Math.round((m.top.count / m.total) * 100) : 0}
            >
              <p className="sub">{m.neighborhood}</p>
              {m.runners.length > 0 && (
                <p className="sub">{m.runners.map((r, j) => `${j + 2}위 ${r.type} ${r.count}명`).join(" · ")}</p>
              )}
              <RowActions slug={m.slug} type={m.top.type} />
            </FocusRow>
          ))}
        </SplitList>
      )}
      {ranked.length === 0 && pending.length === 0 && <Empty>이 지역에는 의견을 모으는 공실이 없어요. 다른 지역을 골라 보세요.</Empty>}
      <Pending spaces={pending} type={null} />
      <Back to="/find?item=no" />
    </ContinuousPage>
  );
}
