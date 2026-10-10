import { Link } from "react-router";
import type { Route } from "./+types/admin-applications";
import { requireAdmin } from "~/lib/auth.server";
import { listAdminApplications } from "~/lib/admin-todo.server";
import { revenueMissingIds } from "~/lib/admin-lists.server";
import { nextAction } from "~/lib/admin-stage";
import { adminFileUrl } from "~/lib/cover";
import { SpaceAvatar } from "~/components/SpaceAvatar";
import { AdminPage, Chip } from "~/components/admin";
import { btnSmall, btnSmallGhost } from "~/components/ui";

const CHIPS = [
  { key: "", label: "전체" },
  { key: "evaluating", label: "평가 중" },
  { key: "mail", label: "메일 보낼 차례" },
  { key: "owner-review", label: "건물주 검토 중" },
  { key: "failed", label: "실패" },
] as const;

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const status = new URL(request.url).searchParams.get("status") ?? "";
  const missing = await revenueMissingIds(env.DB, Date.now());
  const all = (await listAdminApplications(env.DB, {})).map((a) => ({
    ...a,
    revenueMissing: missing.has(a.id),
    next: nextAction({
      kind: "application",
      ai_status: a.ai_status,
      result_mailed_at: a.result_mailed_at,
      track: a.track,
      consent_consulting_at: missing.has(a.id) ? 1 : null,
      has_month_this_month: false,
    }),
  }));
  const counts: Record<string, number> = { "": all.length, revenue: missing.size };
  for (const a of all) counts[a.stage.key] = (counts[a.stage.key] ?? 0) + 1;
  const rows = all.filter((a) => (status === "revenue" ? a.revenueMissing : !status || a.stage.key === status));
  return { rows, counts, status };
}

export default function AdminApplications({ loaderData }: Route.ComponentProps) {
  const { rows, counts, status } = loaderData;
  const href = (key: string) => (key ? `/admin/applications?status=${key}` : "/admin/applications");
  return (
    <AdminPage>
      <p className="text-[15px] font-medium text-muted">신청</p>
      <h1 className="mt-1 text-[26px] font-bold lg:text-[32px]">창업 신청 {counts[""]}건</h1>

      <nav aria-label="신청 단계" className="mt-5 flex flex-wrap gap-2">
        {CHIPS.map((c) => (
          <Chip key={c.key} to={href(c.key)} on={status === c.key}>
            {c.label} {counts[c.key] ?? 0}
          </Chip>
        ))}
        {status === "revenue" && (
          <Chip to={href("revenue")} on>
            이번 달 매출 미기록 {counts.revenue}
          </Chip>
        )}
      </nav>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-[10px] border border-dashed border-line p-4 text-base text-muted">조건에 맞는 신청이 없어요.</p>
      ) : (
        <ul className="mt-5 divide-y divide-line border-y border-line" data-testid="application-list">
          {rows.map((a) => (
            <li key={a.id} data-testid="application-row" className="grid grid-cols-[56px_1fr] items-center gap-x-4 gap-y-3 py-4 lg:grid-cols-[56px_1.4fr_1fr_130px_120px_170px]">
              <SpaceAvatar src={a.cover_key ? adminFileUrl(a.cover_key) : null} name={a.space_name} neighborhood={a.neighborhood} size={56} />
              <div className="min-w-0">
                <Link to={`/admin/applications/${a.id}`} className="font-medium underline-offset-4 hover:underline">
                  {a.contact_name} · {a.business_type}
                </Link>
                <p className="text-[15px] text-muted">{a.space_name}</p>
              </div>
              <p className="col-span-2 text-[15px] tabular-nums lg:col-span-1">
                <span className="text-muted lg:hidden">AI 점수 </span>
                {a.ai_status === "done" && a.ai_score !== null ? `${a.ai_score}점 (참고용)` : "—"}
                <span className="ml-2 text-muted">{a.track === "ssulmo" ? "쓸모 트랙" : "일반"}</span>
              </p>
              <p className="col-span-2 lg:col-span-1">
                <span className="rounded-full border border-line bg-soft px-2.5 py-0.5 text-[15px] font-bold">{a.stage.label}</span>
              </p>
              <p className="col-span-2 hidden text-[15px] text-muted lg:col-span-1 lg:block">{a.track === "ssulmo" ? "쓸모" : "일반"}</p>
              <div className="col-span-2 lg:col-span-1 lg:text-right">
                <Link to={`/admin/applications/${a.id}`} className={a.next && a.next.key !== "wait-owner" ? btnSmall : btnSmallGhost}>
                  {a.next && a.next.key !== "wait-owner" ? a.next.title : "상세"}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AdminPage>
  );
}
