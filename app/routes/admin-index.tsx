import { data, Form, Link } from "react-router";
import type { Route } from "./+types/admin-index";
import { requireAdmin } from "~/lib/auth.server";
import { adminTodoCounts, listAdminSpaces } from "~/lib/admin-todo.server";
import { moderateSpace } from "~/lib/admin-lists.server";
import { listPendingSpaces } from "~/lib/owner-spaces.server";
import { adminFileUrl } from "~/lib/cover";
import { SpaceAvatar } from "~/components/SpaceAvatar";
import { AdminPage, adminDate, CountNumber } from "~/components/admin";
import { btnSmall, btnSmallGhost, ErrorNote, Section } from "~/components/ui";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const now = Date.now();
  const covers = new Map((await listAdminSpaces(env.DB, { status: "pending" })).map((s) => [s.id, s.cover_key]));
  return {
    counts: await adminTodoCounts(env.DB, now),
    pending: (await listPendingSpaces(env.DB)).map((p) => ({ ...p, coverKey: covers.get(p.id) ?? p.photoKeys[0] ?? null })),
    today: new Date(now).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "long" }),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const failure = await moderateSpace(env.DB, await request.formData());
  if (failure) return data({ error: failure.error }, { status: failure.status });
  return { error: null };
}

export default function AdminIndex({ loaderData, actionData }: Route.ComponentProps) {
  const { counts, pending, today } = loaderData;
  const cards = [
    { key: "pendingSpaces", to: "/admin/spaces?status=pending", n: counts.pendingSpaces, unit: "곳", title: "공실 승인 대기", hint: "건물주가 등록했어요" },
    { key: "unmailed", to: "/admin/applications?status=mail", n: counts.unmailed, unit: "건", title: "결과 메일 안 보냄", hint: "평가는 끝났어요" },
    { key: "aiFailed", to: "/admin/applications?status=failed", n: counts.aiFailed, unit: "건", title: "AI 평가 실패", hint: "재평가가 필요해요" },
    { key: "revenueMissing", to: "/admin/applications?status=revenue", n: counts.revenueMissing, unit: "건", title: "이번 달 매출 미기록", hint: "쓸모 트랙" },
  ] as const;

  return (
    <AdminPage>
      <header className="mb-8">
        <p className="text-[15px] font-medium text-muted">{today}</p>
        <h1 className="mt-2 text-[26px] font-bold lg:text-[32px]">
          {counts.total > 0 ? (
            <>
              지금 처리할 일 <mark className="hl">{counts.total}건</mark>
            </>
          ) : (
            "처리할 일이 없어요"
          )}
        </h1>
      </header>
      <ErrorNote message={actionData?.error} />

      <div className="mb-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.key}
            to={c.to}
            data-testid={`todo-${c.key}`}
            data-hot={c.n > 0 ? "1" : "0"}
            className={`flex min-h-36 flex-col gap-2 rounded-[14px] border p-4 lg:p-5 ${c.n > 0 ? "border-yellow-deep bg-yellow" : "border-line bg-paper"}`}
          >
            <CountNumber value={c.n} unit={c.unit} />
            <b className="mt-1 text-base">{c.title}</b>
            <span className="text-[15px] text-muted">{c.n > 0 ? c.hint : "처리할 일이 없어요"}</span>
          </Link>
        ))}
      </div>

      <Section title={`승인 대기 공실 ${pending.length}곳`}>
        {pending.length === 0 ? (
          <p className="rounded-[10px] border border-dashed border-line p-3 text-base text-muted">확인 대기 중인 공실이 없어요.</p>
        ) : (
          <ul className="divide-y divide-line">
            {pending.map((p) => (
              <li key={p.id} data-testid="pending-space" className="py-4 text-base">
                <div className="flex gap-4">
                  <SpaceAvatar src={p.coverKey ? adminFileUrl(p.coverKey) : null} name={p.name} neighborhood={p.neighborhood} size={56} />
                  <div className="min-w-0 flex-1">
                    <p>
                      <Link to={`/admin/spaces/${p.id}`} className="font-medium underline-offset-4 hover:underline">
                        {p.name}
                      </Link>
                    </p>
                    <p className="text-[15px] text-muted">
                      {p.neighborhood} · 건물주 {p.ownerName ?? "이름 없음"} · {adminDate(p.createdAt)} 등록
                    </p>
                    <p className="break-all text-[15px] text-muted">
                      {p.ownerEmail}
                      {p.ownerPhone ? ` · ${p.ownerPhone}` : ""}
                    </p>
                    <details className="mt-2 text-[15px]">
                      <summary className="min-h-8 cursor-pointer text-muted">
                        사진 {p.photoKeys.length}장 · 위치 특징 {p.locationNotes ? "있음" : "없음"} 보기
                      </summary>
                      <p className="mt-2 whitespace-pre-wrap">{p.locationNotes ?? "위치 특징이 없어요."}</p>
                      <p className="mt-2">
                        {p.photoKeys.map((k, i) => (
                          <a key={k} className="mr-3 underline" href={adminFileUrl(k)}>
                            사진 {i + 1}
                          </a>
                        ))}
                      </p>
                    </details>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 sm:pl-[72px]">
                  <Form method="post">
                    <input type="hidden" name="spaceId" value={p.id} />
                    <input type="hidden" name="intent" value="approve" />
                    <button className={btnSmall}>승인</button>
                  </Form>
                  <Form method="post" className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="spaceId" value={p.id} />
                    <input type="hidden" name="intent" value="reject" />
                    <input
                      name="reason"
                      maxLength={200}
                      placeholder="반려 사유 (선택, 건물주에게 보여요)"
                      aria-label={`${p.name} 반려 사유`}
                      className="min-h-10 w-64 max-w-full rounded-[10px] border border-line px-3 py-2"
                    />
                    <button className={btnSmallGhost}>반려</button>
                  </Form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </AdminPage>
  );
}
