import type { Route } from "./+types/admin-index";
import { requireAdmin } from "~/lib/auth.server";
import { Shell, Title } from "~/components/ui";

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireAdmin(request, context.cloudflare.env);
  return null;
}

export default function AdminIndex() {
  return (
    <Shell wide>
      <Title eyebrow="ADMIN">대시보드</Title>
    </Shell>
  );
}
