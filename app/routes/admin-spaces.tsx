import { Form, Link } from "react-router";
import type { Route } from "./+types/admin-spaces";
import { requireAdmin } from "~/lib/auth.server";
import { listAdminSpaces } from "~/lib/admin-todo.server";
import { adminFileUrl } from "~/lib/cover";
import { SpaceAvatar } from "~/components/SpaceAvatar";
import { AdminPage, Chip } from "~/components/admin";
import { ProgressBar } from "~/components/NumberTicker";
import { btnSmall, btnSmallGhost } from "~/components/ui";

const CHIPS = [
  { key: "", label: "전체" },
  { key: "pending", label: "승인 대기" },
  { key: "collecting", label: "의견 모으는 중" },
  { key: "ready", label: "후보 준비됨" },
  { key: "rejected", label: "반려" },
  { key: "private", label: "비공개" },
] as const;

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "";
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 60);
  const all = await listAdminSpaces(env.DB, {});
  const counts: Record<string, number> = { "": all.length };
  for (const s of all) counts[s.stage.key] = (counts[s.stage.key] ?? 0) + 1;
  const qLower = q.toLowerCase();
  const rows = all.filter(
    (s) => (!status || s.stage.key === status) && (!qLower || s.name.toLowerCase().includes(qLower) || s.neighborhood.toLowerCase().includes(qLower)),
  );
  return { rows, counts, status, q };
}

export default function AdminSpaces({ loaderData }: Route.ComponentProps) {
  const { rows, counts, status, q } = loaderData;
  const href = (key: string) => {
    const p = new URLSearchParams();
    if (key) p.set("status", key);
    if (q) p.set("q", q);
    const s = p.toString();
    return s ? `/admin/spaces?${s}` : "/admin/spaces";
  };
  return (
    <AdminPage>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[15px] font-medium text-muted">공실</p>
          <h1 className="mt-1 text-[26px] font-bold lg:text-[32px]">공실 {counts[""]}곳</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Form method="get" role="search" className="flex gap-2">
            {status && <input type="hidden" name="status" value={status} />}
            <input
              name="q"
              defaultValue={q}
              maxLength={60}
              placeholder="공실 이름·동네 검색"
              aria-label="공실 검색"
              className="min-h-10 w-56 max-w-full rounded-[10px] border border-line px-3 py-2 focus:border-ink focus:outline-none"
            />
            <button className={btnSmallGhost}>검색</button>
          </Form>
          <Link to="/admin/spaces/new" className={btnSmall}>
            + 공간 등록
          </Link>
        </div>
      </div>

      <nav aria-label="공실 단계" className="mt-5 flex flex-wrap gap-2">
        {CHIPS.map((c) => (
          <Chip key={c.key} to={href(c.key)} on={status === c.key}>
            {c.label} {counts[c.key] ?? 0}
          </Chip>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-[10px] border border-dashed border-line p-4 text-base text-muted">조건에 맞는 공실이 없어요.</p>
      ) : (
        <ul className="mt-5 divide-y divide-line border-y border-line" data-testid="space-list">
          {rows.map((s) => (
            <li key={s.id} data-testid="space-row" className="grid grid-cols-[56px_1fr] items-center gap-x-4 gap-y-3 py-4 lg:grid-cols-[56px_1fr_240px_150px]">
              <SpaceAvatar src={s.cover_key ? adminFileUrl(s.cover_key) : null} name={s.name} neighborhood={s.neighborhood} size={56} />
              <div className="min-w-0">
                <Link to={`/admin/spaces/${s.id}`} className="font-medium underline-offset-4 hover:underline">
                  {s.name}
                </Link>
                <p className="text-[15px] text-muted">
                  {s.neighborhood} · {s.owner_id !== null ? `건물주 ${s.owner_name ?? "이름 없음"}` : "운영자 등록"}
                </p>
              </div>
              <div className="col-span-2 lg:col-span-1">
                <p className="text-[15px]">
                  <span className="mr-2 rounded-full border border-line bg-soft px-2.5 py-0.5 text-[15px] font-bold">{s.stage.label}</span>
                  {s.stage.progress ? s.stage.detail : s.stage.key === "ready" ? s.stage.detail : ""}
                </p>
                {s.stage.progress && (
                  <div className="mt-2">
                    <ProgressBar value={s.stage.progress.value} max={s.stage.progress.max} label={s.stage.detail} />
                  </div>
                )}
              </div>
              <div className="col-span-2 lg:col-span-1 lg:text-right">
                <Link to={`/admin/spaces/${s.id}`} className={s.stage.key === "pending" ? btnSmall : btnSmallGhost}>
                  {s.stage.key === "pending" ? "승인·반려" : "QR · 상세"}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AdminPage>
  );
}
