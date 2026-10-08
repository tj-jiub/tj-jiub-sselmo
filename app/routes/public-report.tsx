import { Link } from "react-router";
import type { Route } from "./+types/public-report";
import { getPublicSpace } from "~/lib/spaces.server";
import { listAnswers } from "~/lib/surveys.server";
import { aggregate, formatIntent, isPublicReady } from "~/lib/report";
import { btnPrimary, Card, Hl, Shell, Title } from "~/components/ui";

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
    <Shell wide>
      <Title eyebrow={neighborhood}>
        {name}, <Hl>동네가 원하는 가게</Hl>
      </Title>
      <div className="split">
        {lines === null ? (
          <Card className="py-16 text-center">
            <p className="text-h3 font-bold">집계 중</p>
          </Card>
        ) : (
          <ul className="grid gap-3">
            {lines.map((l, i) => (
              <li key={l.type}>
                <Card top={i === 0} className="!py-3.5">
                  <p className="text-lg font-bold">{l.type}</p>
                  <p className="mt-1 text-[15px]">{l.text}</p>
                </Card>
              </li>
            ))}
          </ul>
        )}
        <aside className="rounded-[14px] border border-line bg-soft p-5 lg:p-7">
          <p className="mb-4 font-bold">이 자리에서 창업을 해보고 싶다면</p>
          <Link to={`/apply/${slug}`} className={`${btnPrimary} w-full`}>
            이 자리에 창업 신청하기
          </Link>
        </aside>
      </div>
    </Shell>
  );
}
