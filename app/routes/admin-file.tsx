import type { Route } from "./+types/admin-file";
import { requireAdmin } from "~/lib/auth.server";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const key = params["*"];
  const object = key ? await env.UPLOADS.get(key) : null;
  if (!object) throw new Response("Not found", { status: 404 });
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${key!.split("/").pop()}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
