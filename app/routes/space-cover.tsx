import type { Route } from "./+types/space-cover";
import { publicCoverResponse } from "~/lib/cover.server";

/** Public cover photo: 200 only for an active, consented space; everything else is the same 404. */
export async function loader({ params, context }: Route.LoaderArgs) {
  return publicCoverResponse(context.cloudflare.env, params.slug);
}
