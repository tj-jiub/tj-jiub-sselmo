import { Link } from "react-router";
import type { Route } from "./+types/admin-index";
import { requireAdmin } from "~/lib/auth.server";
import { listSpaces } from "~/lib/spaces.server";
import { Section, Shell, Title } from "~/components/ui";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  return { spaces: await listSpaces(env.DB) };
}

export default function AdminIndex({ loaderData }: Route.ComponentProps) {
  return (
    <Shell wide>
      <Title eyebrow="ADMIN">대시보드</Title>
      <Section title="공간">
        <ul className="divide-y divide-line text-sm">
          {loaderData.spaces.map((s) => (
            <li key={s.id}>
              <Link to={`/admin/spaces/${s.id}`} className="flex justify-between gap-3 py-3">
                <span>
                  <span className="font-medium">{s.name}</span>
                  <span className="ml-2 text-muted">{s.neighborhood}</span>
                </span>
                <span className="shrink-0 text-muted">
                  응답 {s.response_count} · {s.owner_consent ? "공개" : "비공개"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <Link to="/admin/spaces/new" className="mt-4 inline-block rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-paper">
          + 공간 등록
        </Link>
      </Section>
    </Shell>
  );
}
