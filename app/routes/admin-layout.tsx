import { Form, Link, Outlet } from "react-router";
import type { Route } from "./+types/admin-layout";
import { requireAdmin } from "~/lib/auth.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireAdmin(request, context.cloudflare.env);
  return null;
}

export default function AdminLayout() {
  return (
    <div>
      <nav className="border-b border-line">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 text-sm">
          <Link to="/admin" className="font-bold">
            썰모 관리자
          </Link>
          <Form method="post" action="/admin/logout">
            <button className="text-muted underline-offset-4 hover:underline">로그아웃</button>
          </Form>
        </div>
      </nav>
      <Outlet />
    </div>
  );
}
