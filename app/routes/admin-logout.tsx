import type { Route } from "./+types/admin-logout";
import { logout } from "~/lib/auth.server";

export async function action({ request, context }: Route.ActionArgs) {
  return logout(request, context.cloudflare.env);
}
