import { Link } from "react-router";
import type { Route } from "./+types/public-report";
import { getPublicSpace } from "~/lib/spaces.server";
import { listAnswers } from "~/lib/surveys.server";
import { aggregate, formatIntent, isPublicReady } from "~/lib/report";
import { Shell, Title } from "~/components/ui";

export async function loader({ params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const space = await getPublicSpace(env.DB, params.slug);
  if (!space) throw new Response("Not found", { status: 404 });
  const report = aggregate(await listAnswers(env.DB, space.id));
  const header = { name: space.name, neighborhood: space.neighborhood, slug: space.slug };
  // Below the threshold, send nothing but the header — not even the count.
  if (!isPublicReady(report.total)) return { ...header, lines: null };
  return {
    ...header,
    lines: report.byType.map((s) => ({ type: s.type, text: formatIntent(report.total, s.count) })),
  };
}

export default function PublicReport({ loaderData }: Route.ComponentProps) {
  const { name, neighborhood, slug, lines } = loaderData;
  return (
    <Shell>
      <Title eyebrow={neighborhood}>{name}, 동네가 원하는 가게</Title>
      {lines === null ? (
        <p className="py-16 text-center text-lg font-semibold">집계 중</p>
      ) : (
        <ul className="divide-y divide-line">
          {lines.map((l) => (
            <li key={l.type} className="py-4">
              <p className="font-semibold">{l.type}</p>
              <p className="mt-1 text-sm text-muted">{l.text}</p>
            </li>
          ))}
        </ul>
      )}
      <Link to={`/apply/${slug}`} className="mt-10 block rounded-lg bg-ink py-3.5 text-center font-semibold text-paper">
        이 자리에 창업 신청하기
      </Link>
    </Shell>
  );
}
