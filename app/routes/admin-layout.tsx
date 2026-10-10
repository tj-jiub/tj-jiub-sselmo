import { Form, Link, NavLink, Outlet } from "react-router";
import type { Route } from "./+types/admin-layout";
import { requireAdmin } from "~/lib/auth.server";
import { adminNavCounts } from "~/lib/admin-todo.server";

export const meta: Route.MetaFunction = () => [{ name: "robots", content: "noindex" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  return { counts: await adminNavCounts(env.DB, Date.now()), email: env.ADMIN_EMAIL };
}

const ITEMS = [
  { to: "/admin", label: "할 일", key: "todo", end: true },
  { to: "/admin/spaces", label: "공실", key: "spaces", end: false },
  { to: "/admin/applications", label: "신청", key: "applications", end: false },
  { to: "/admin/owners", label: "건물주", key: "owners", end: false },
] as const;

const logoutButton = "min-h-10 text-[15px] text-muted underline-offset-4 hover:text-ink hover:underline";

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  const { counts, email } = loaderData;
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[232px_1fr]">
      <header className="border-b border-line bg-soft lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:border-r lg:border-b-0 lg:px-4 lg:py-6">
        <div className="flex items-center justify-between px-4 pt-3 lg:px-3 lg:pt-0 lg:pb-4">
          <Link to="/admin" className="text-lg font-bold tracking-tight">
            쓸모 관리자
          </Link>
          <Form method="post" action="/admin/logout" className="lg:hidden">
            <button className={logoutButton}>로그아웃</button>
          </Form>
        </div>
        <nav aria-label="관리자 메뉴" className="flex gap-1 overflow-x-auto px-3 pb-2 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
          {ITEMS.map((item) => {
            const n = counts[item.key];
            const hot = item.key === "todo" && n > 0;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex min-h-11 shrink-0 items-center justify-between gap-3 rounded-[10px] border px-3.5 py-2 text-base ${isActive ? "border-line bg-paper font-bold" : "border-transparent hover:bg-paper"}`
                }
              >
                {item.label}
                <span className={`font-mono text-sm tabular-nums ${hot ? "rounded-full bg-yellow px-2" : "text-muted"}`} data-testid={`nav-count-${item.key}`}>
                  {n}
                </span>
              </NavLink>
            );
          })}
        </nav>
        <div className="mt-auto hidden px-3 text-[15px] text-muted lg:block">
          <p className="break-all">{email}</p>
          <Form method="post" action="/admin/logout">
            <button className={logoutButton}>로그아웃</button>
          </Form>
        </div>
      </header>
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
