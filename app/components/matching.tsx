import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { BUSINESS_CATEGORIES } from "~/lib/survey";
import {
  ANY_DISTRICT,
  headlineWord,
  objectParticle,
  pageLayout,
  type DistrictMatch,
  type PendingSpace,
  type TypeMatch,
} from "~/lib/matching";
import { Card, Hl, Title } from "~/components/ui";

const STEP_LABELS = ["1 · 아이템", "2 · 고르기", "3 · 추천 공실"];

export function Steps({ current, pick }: { current: 1 | 2 | 3; pick?: "업종" | "지역" }) {
  const labels = [STEP_LABELS[0], pick ? `2 · ${pick}` : STEP_LABELS[1], STEP_LABELS[2]];
  return (
    <ol className="mb-6 flex gap-2 text-xs text-muted" aria-label="진행 단계">
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
  "inline-flex items-baseline gap-1.5 rounded-full border border-line px-4 py-2 text-sm hover:border-ink focus-visible:outline-2";

export function StartStep() {
  const choices = [
    { to: "?item=yes", title: "네, 정했어요", desc: "업종을 고르면, 그 업종을 원한다고 답한 동네의 공실을 보여드려요." },
    { to: "?item=no", title: "아직이에요", desc: "원하는 지역을 고르면, 그곳 공실과 동네가 가장 원하는 업종을 알려드려요." },
  ];
  return (
    <>
      <Steps current={1} />
      <Title eyebrow="공실 찾기">사업 아이템이 정해졌나요?</Title>
      <div className="grid gap-3 md:grid-cols-2">
        {choices.map((c) => (
          <Link key={c.to} to={c.to} className="block">
            <Card>
              <b className="block text-lg">{c.title}</b>
              <span className="mt-1 block text-sm text-muted">{c.desc}</span>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}

export function TypeStep() {
  return (
    <>
      <Steps current={2} pick="업종" />
      <Title eyebrow="공실 찾기">어떤 가게를 하려고 하나요?</Title>
      <div className="grid gap-3">
        {BUSINESS_CATEGORIES.map((cat) => (
          <section key={cat.name} className="rounded-xl border border-line p-4">
            <h2 className="mb-3 text-sm font-bold">{cat.name}</h2>
            <div className="flex flex-wrap gap-2">
              {cat.types.map((t) => (
                <Link key={t} to={`?item=yes&type=${encodeURIComponent(t)}`} className={chipClass}>
                  {t}
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
      <BackLink to="/find" />
    </>
  );
}

export function DistrictStep({ districts }: { districts: Array<{ district: string; count: number }> }) {
  return (
    <>
      <Steps current={2} pick="지역" />
      <Title eyebrow="공실 찾기" sub="공실이 등록된 구만 보여드려요.">
        선호하는 지역이 있나요?
      </Title>
      {districts.length === 0 && <p className="text-sm text-muted">지금 의견을 모으는 공실이 없어요.</p>}
      <div className="flex flex-wrap gap-2">
        {districts.map((d) => (
          <Link key={d.district} to={`?item=no&district=${encodeURIComponent(d.district)}`} className={chipClass}>
            {d.district}
            <small className="text-xs text-muted">{d.count}곳</small>
          </Link>
        ))}
        {districts.length > 0 && (
          <Link to={`?item=no&district=${ANY_DISTRICT}`} className={chipClass}>
            상관없어요
          </Link>
        )}
      </div>
      <BackLink to="/find" />
    </>
  );
}

function BackLink({ to }: { to: string }) {
  return (
    <p className="mt-8">
      <Link to={to} className="text-sm text-muted underline">
        ← 이전
      </Link>
    </p>
  );
}

function Bar({ count, total }: { count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
      <div className="h-full bg-green-deep" style={{ width: `${pct}%` }} />
    </div>
  );
}

function CardActions({ slug, type }: { slug: string; type: string | null }) {
  const apply = type ? `/apply/${slug}?type=${encodeURIComponent(type)}` : `/apply/${slug}`;
  return (
    <div className="mt-4 flex flex-wrap gap-2 text-sm md:mt-0 md:flex-col">
      <Link to={`/r/${slug}`} className="rounded-lg border border-ink px-3.5 py-2 text-center font-semibold">
        동네 의견 보기
      </Link>
      <Link to={apply} className="rounded-lg bg-ink px-3.5 py-2 text-center font-semibold text-paper">
        {type ? "이 업종으로 지원해보기" : "지원해보기"}
      </Link>
    </div>
  );
}

// Every card is rendered; pageLayout() hides the overflow with CSS until
// "더 보기" is pressed (1 card on mobile, 3 on PC).
function CardList<T extends { slug: string }>({ items, render }: { items: T[]; render: (item: T, i: number) => ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const layout = pageLayout(items.length, expanded);
  return (
    <>
      <ul className="grid gap-3">
        {items.map((item, i) => (
          <li key={item.slug} className={layout.itemClass(i)}>
            {render(item, i)}
          </li>
        ))}
      </ul>
      {layout.moreClass !== null && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className={`mt-3 w-full rounded-lg border border-line py-3 text-sm font-semibold ${layout.moreClass}`}
        >
          더 보기
        </button>
      )}
    </>
  );
}

function Pending({ spaces, type }: { spaces: PendingSpace[]; type: string | null }) {
  if (spaces.length === 0) return null;
  return (
    <section className="mt-6 rounded-xl border border-dashed border-line bg-soft p-4 text-sm">
      <b>집계 중인 공실 {spaces.length}곳</b>
      <ul className="mt-2 grid gap-2">
        {spaces.map((s) => (
          <li key={s.slug} className="text-muted">
            {s.neighborhood} · {s.name} — 의견이 50명 넘게 모이면 숫자를 보여드려요.{" "}
            <Link to={type ? `/apply/${s.slug}?type=${encodeURIComponent(type)}` : `/apply/${s.slug}`} className="underline">
              그래도 지원하기
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-soft p-5 text-sm text-muted">
      {children}
      <p className="mt-3">
        <Link to="/find" className="font-semibold text-ink underline">
          처음부터 다시 찾기
        </Link>
      </p>
    </div>
  );
}

export function TypeResults({ type, ranked, pending }: { type: string; ranked: TypeMatch[]; pending: PendingSpace[] }) {
  return (
    <>
      <Steps current={3} pick="업종" />
      <Title eyebrow={`${type} · 추천 공실`} sub={ranked.length > 0 ? "이 업종을 고른 주민이 많은 순서예요." : undefined}>
        {ranked.length > 0
          ? `${type}${objectParticle(type)} 원하는 동네가 ${ranked.length}곳 있어요`
          : `${type}${objectParticle(type)} 원하는 의견이 모인 공실이 아직 없어요`}
      </Title>
      {ranked.length === 0 && pending.length === 0 && (
        <Empty>다른 업종을 골라 보거나, 지역으로 먼저 찾아볼 수 있어요.</Empty>
      )}
      <CardList
        items={ranked}
        render={(m) => (
          <Card top={m.rank === 1}>
            <div className="md:flex md:items-start md:justify-between md:gap-6">
              <div>
                <div className="text-xs text-muted">
                  <span className="font-bold text-ink">{String(m.rank).padStart(2, "0")}</span> · {m.neighborhood}
                </div>
                <div className="mt-1 text-lg font-bold">{m.name}</div>
                <div className="mt-1 text-sm">
                  {type} · <b>{m.phrase}</b>
                </div>
                <Bar count={m.count} total={m.total} />
              </div>
              <CardActions slug={m.slug} type={type} />
            </div>
          </Card>
        )}
      />
      <Pending spaces={pending} type={type} />
      <BackLink to="/find?item=yes" />
    </>
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
    <>
      <Steps current={3} pick="지역" />
      <Title eyebrow={`${scope} · 추천 공실`}>
        {lead ? (
          <>
            {district === ANY_DISTRICT ? "의견이 모인 공실에는" : `${district}에는`} <Hl>{lead}</Hl>
            {objectParticle(lead)} 원하는 공실이 있어요
          </>
        ) : (
          `${scope}에는 아직 숫자를 보여드릴 공실이 없어요`
        )}
      </Title>
      {ranked.length === 0 && pending.length === 0 && (
        <Empty>이 지역에는 의견을 모으는 공실이 없어요. 다른 지역을 골라 보세요.</Empty>
      )}
      <CardList
        items={ranked}
        render={(m, i) => (
          <Card top={i === 0}>
            <div className="md:flex md:items-start md:justify-between md:gap-6">
              <div>
                <div className="text-xs text-muted">{m.neighborhood}</div>
                <div className="mt-1 text-lg font-bold">{m.name}</div>
                <div className="mt-1 text-sm">
                  <span className="block md:inline">1위 {m.top.type}</span>
                  <span className="hidden md:inline"> · </span>
                  <b className="mt-1 block md:mt-0 md:inline">{m.phrase}</b>
                </div>
                <Bar count={m.top.count} total={m.total} />
                {m.runners.length > 0 && (
                  <p className="mt-2 hidden text-xs text-muted md:block">
                    {m.runners.map((r, j) => `${j + 2}위 ${r.type} ${r.count}명`).join(" · ")}
                  </p>
                )}
              </div>
              <CardActions slug={m.slug} type={m.top.type} />
            </div>
          </Card>
        )}
      />
      <Pending spaces={pending} type={null} />
      <BackLink to="/find?item=no" />
    </>
  );
}
