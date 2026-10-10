import { redirect } from "react-router";
import type { Route } from "./+types/owner-logout";
import { endOwnerSession } from "~/lib/owner-auth.server";

export const loader = () => redirect("/owner");

// Ending a session needs no authorisation: it only clears the caller's own cookie (also when it is stale).
export async function action({ request, context }: Route.ActionArgs) {
  return endOwnerSession(request, context.cloudflare.env);
}
