import { Link } from "react-router";
import type { Route } from "./+types/spaces";
import { listPublicSpaces } from "~/lib/spaces.server";
import { listAnswers } from "~/lib/surveys.server";
import { aggregate, isPublicReady } from "~/lib/report";
import { Shell, Title } from "~/components/ui";

export const meta: Route.MetaFunction = () => [{ title: "공실 고르기 — 썰모" }];

export async function loader({ context }: Route.LoaderArgs) {
  const db = context.cloudflare.env.DB;
  const spaces = await listPublicSpaces(db);
  return {
    spaces: await Promise.all(
      spaces.map(async (s) => {
        const report = aggregate(await listAnswers(db, s.id));
        const ready = isPublicReady(report.total);
        // Below the threshold, expose neither the count nor the ranking.
        return {
          slug: s.slug,
          name: s.name,
          neighborhood: s.neighborhood,
          total: ready ? report.total : null,
          top: ready ? (report.byType[0]?.type ?? null) : null,
        };
      }),
    ),
  };
}

export default function Spaces({ loaderData }: Route.ComponentProps) {
  return (
    <Shell>
      <Title eyebrow="창업 신청" sub="동네 의견이 모이고 있는 공실이에요.">
        어느 자리에 창업하고 싶나요?
      </Title>
      {loaderData.spaces.length === 0 && <p className="text-sm text-muted">지금 모집 중인 공실이 없어요.</p>}
      <ul className="divide-y divide-line">
        {loaderData.spaces.map((s) => (
          <li key={s.slug} className="py-4">
            <div className="flex justify-between gap-3">
              <b>{s.name}</b>
              <span className="shrink-0 text-xs text-muted">{s.total === null ? "집계 중" : `의견 ${s.total}건`}</span>
            </div>
            <p className="mt-0.5 text-xs text-muted">
              {s.neighborhood}
              {s.top && ` · 1위 ${s.top}`}
            </p>
            <div className="mt-3 flex gap-2 text-sm">
              <Link to={`/r/${s.slug}`} className="rounded-lg border border-ink px-3.5 py-2 font-semibold">
                동네 의견 보기
              </Link>
              <Link to={`/apply/${s.slug}`} className="rounded-lg bg-ink px-3.5 py-2 font-semibold text-paper">
                신청하기
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </Shell>
  );
}
