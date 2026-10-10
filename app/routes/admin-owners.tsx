import type { Route } from "./+types/admin-owners";
import { requireAdmin } from "~/lib/auth.server";
import { listAdminOwners } from "~/lib/admin-owners.server";
import { AdminPage, adminDate } from "~/components/admin";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  return { owners: await listAdminOwners(env.DB) };
}

export default function AdminOwners({ loaderData }: Route.ComponentProps) {
  const { owners } = loaderData;
  return (
    <AdminPage>
      <p className="text-[15px] font-medium text-muted">건물주 (개인정보)</p>
      <h1 className="mt-1 text-[26px] font-bold lg:text-[32px]">건물주 {owners.length}명</h1>
      {owners.length === 0 ? (
        <p className="mt-6 rounded-[10px] border border-dashed border-line p-4 text-base text-muted">아직 가입한 건물주가 없어요.</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-base" data-testid="owner-table">
            <thead className="text-[15px] text-muted">
              <tr>
                <th className="py-2 font-medium">이름</th>
                <th className="py-2 font-medium">이메일</th>
                <th className="py-2 font-medium">전화번호</th>
                <th className="py-2 font-medium">등록한 공실</th>
                <th className="py-2 font-medium">마지막 로그인</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line tabular-nums">
              {owners.map((o) => (
                <tr key={o.id}>
                  <td className="py-2.5 font-medium">{o.name ?? "이름 없음"}</td>
                  <td className="py-2.5 break-all">{o.email}</td>
                  <td className="py-2.5">{o.phone ?? "—"}</td>
                  <td className="py-2.5">{o.spaceCount}곳</td>
                  <td className="py-2.5 text-muted">{o.lastLoginAt ? adminDate(o.lastLoginAt) : "로그인 기록 없음"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminPage>
  );
}
