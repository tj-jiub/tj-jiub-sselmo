import { data, Form, Link } from "react-router";
import type { Route } from "./+types/admin-index";
import { requireAdmin } from "~/lib/auth.server";
import { listApplications } from "~/lib/applications.server";
import { listSpaces } from "~/lib/spaces.server";
import { mailerFromEnv } from "~/lib/mail.server";
import { spaceStatusLabel } from "~/lib/space-status";
import { approveSpace, listPendingSpaces, rejectSpace } from "~/lib/owner-spaces.server";
import { btnSmall, btnSmallGhost, ErrorNote, Section, Shell, Title } from "~/components/ui";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  return { pending: await listPendingSpaces(env.DB), spaces: await listSpaces(env.DB), applications: await listApplications(env.DB), autoMail: mailerFromEnv(env) !== null };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const form = await request.formData();
  const intent = form.get("intent");
  const rawId = String(form.get("spaceId") ?? "");
  if (!/^\d+$/.test(rawId)) return data({ error: "공실 번호가 올바르지 않아요." }, { status: 400 });
  const id = Number(rawId);
  if (!Number.isSafeInteger(id)) return data({ error: "공실 번호가 올바르지 않아요." }, { status: 400 });
  if (intent === "approve") {
    if (!(await approveSpace(env.DB, id))) return data({ error: "이미 처리됐거나 승인할 수 없는 공실이에요." }, { status: 409 });
  } else if (intent === "reject") {
    if (!(await rejectSpace(env.DB, id, String(form.get("reason") ?? "")))) {
      return data({ error: "이미 처리됐거나 반려할 수 없는 공실이에요." }, { status: 409 });
    }
  } else {
    return data({ error: "알 수 없는 요청이에요." }, { status: 400 });
  }
  return { error: null };
}

export default function AdminIndex({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <Shell wide nav={false}>
      <Title eyebrow="관리자">대시보드</Title>
      <ErrorNote message={actionData?.error} />
      <Section title={`확인 대기 공실 ${loaderData.pending.length}건`}>
        {loaderData.pending.length === 0 ? (
          <p className="rounded-[10px] border border-dashed border-line p-3 text-base text-muted">확인 대기 중인 공실이 없어요.</p>
        ) : (
          <ul className="divide-y divide-line">
            {loaderData.pending.map((p) => (
              <li key={p.id} className="py-4 text-base">
                <p>
                  <span className="font-medium">{p.name}</span>
                  <span className="ml-2 text-muted">{p.neighborhood}</span>
                </p>
                <dl className="mt-2 grid grid-cols-[6rem_1fr] gap-y-1">
                  <dt className="text-muted">건물주</dt>
                  <dd className="break-all">
                    {p.ownerName ?? "이름 없음"} · {p.ownerEmail}
                    {p.ownerPhone ? ` · ${p.ownerPhone}` : ""}
                  </dd>
                  <dt className="text-muted">위치 특징</dt>
                  <dd className="whitespace-pre-wrap">{p.locationNotes ?? "없음"}</dd>
                  <dt className="text-muted">사진</dt>
                  <dd>
                    {p.photoKeys.length === 0
                      ? "없음"
                      : p.photoKeys.map((k, i) => (
                          <a key={k} className="mr-3 underline" href={`/admin/files/${k}`}>
                            사진 {i + 1}
                          </a>
                        ))}
                  </dd>
                </dl>
                <div className="mt-3 flex flex-wrap items-center gap-3">
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
      <Section title="공간">
        <ul className="divide-y divide-line">
          {loaderData.spaces.map((s) => (
            <li key={s.id}>
              <Link to={`/admin/spaces/${s.id}`} className="flex min-h-12 items-center justify-between gap-3 py-3">
                <span>
                  <span className="font-medium">{s.name}</span>
                  <span className="ml-2 text-muted">{s.neighborhood}</span>
                </span>
                <span className="shrink-0 text-base text-muted">
                  응답 {s.response_count} · {spaceStatusLabel(s)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <Link to="/admin/spaces/new" className={`${btnSmall} mt-4`}>
          + 공간 등록
        </Link>
      </Section>
      <Section title="창업 신청">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-base">
            <thead className="text-[15px] text-muted">
              <tr>
                <th className="py-2 font-medium">신청자 · 업종</th>
                <th className="py-2 font-medium">공간</th>
                <th className="py-2 font-medium">트랙</th>
                <th className="py-2 font-medium">AI 평가</th>
                <th className="py-2 font-medium">결과 전달</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line tabular-nums">
              {loaderData.applications.map((a) => (
                <tr key={a.id}>
                  <td className="py-2.5">
                    <Link to={`/admin/applications/${a.id}`} className="font-medium underline-offset-4 hover:underline">
                      {a.contact_name} · {a.business_type}
                    </Link>
                  </td>
                  <td className="py-2.5 text-muted">{a.space_name}</td>
                  <td className="py-2.5">{a.track === "ssulmo" ? "쓸모" : "일반"}</td>
                  <td className="py-2.5">{a.ai_status === "done" ? `완료 ${a.ai_score}점` : a.ai_status === "failed" ? "실패" : "대기"}</td>
                  <td className="py-2.5">{a.result_mailed_at ? (loaderData.autoMail ? "자동" : "보냄") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </Shell>
  );
}
