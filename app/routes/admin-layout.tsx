import { Form, Link, Outlet } from "react-router";
import type { Route } from "./+types/admin-layout";
import { requireAdmin } from "~/lib/auth.server";

export const meta: Route.MetaFunction = () => [{ name: "robots", content: "noindex" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireAdmin(request, context.cloudflare.env);
  return null;
}

export default function AdminLayout() {
  return (
    <div>
      <nav className="border-b border-line">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between px-4 py-3.5 text-base lg:px-12">
          <Link to="/admin" className="text-lg font-bold tracking-tight">
            쓸모 관리자
          </Link>
          <Form method="post" action="/admin/logout">
            <button className="min-h-10 text-muted underline-offset-4 hover:text-ink hover:underline">로그아웃</button>
          </Form>
        </div>
      </nav>
      <Outlet />
    </div>
  );
}
