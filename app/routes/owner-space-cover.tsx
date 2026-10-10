import type { Route } from "./+types/owner-space-cover";
import { ownerPhotoResponse } from "~/lib/cover.server";
import { requireOwner } from "~/lib/owner-auth.server";

/** The owner's own photos (cover by default, `?i=N` for the Nth photo). Other owners' ids give 404. */
export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const owner = await requireOwner(request, env);
  if (!/^\d+$/.test(params.id)) return new Response("Not found", { status: 404 });
  const i = new URL(request.url).searchParams.get("i");
  const index = i !== null && /^\d{1,2}$/.test(i) ? Number(i) : null;
  if (i !== null && index === null) return new Response("Not found", { status: 404 });
  return ownerPhotoResponse(env, owner.id, Number(params.id), index);
}
