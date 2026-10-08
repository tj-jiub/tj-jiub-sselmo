import { Link } from "react-router";
import type { Route } from "./+types/admin-index";
import { requireAdmin } from "~/lib/auth.server";
import { listApplications } from "~/lib/applications.server";
import { listSpaces } from "~/lib/spaces.server";
import { btnSmall, Section, Shell, Title } from "~/components/ui";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  return { spaces: await listSpaces(env.DB), applications: await listApplications(env.DB) };
}

export default function AdminIndex({ loaderData }: Route.ComponentProps) {
  return (
    <Shell wide nav={false}>
      <Title eyebrow="ADMIN">대시보드</Title>
      <Section title="공간">
        <ul className="divide-y divide-line">
          {loaderData.spaces.map((s) => (
            <li key={s.id}>
              <Link to={`/admin/spaces/${s.id}`} className="flex min-h-12 items-center justify-between gap-3 py-3">
                <span>
                  <span className="font-medium">{s.name}</span>
                  <span className="ml-2 text-muted">{s.neighborhood}</span>
                </span>
                <span className="shrink-0 text-sm text-muted">
                  응답 {s.response_count} · {s.owner_consent ? "공개" : "비공개"}
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
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="text-cap text-muted">
              <tr>
                <th className="py-2 font-medium">신청자 · 업종</th>
                <th className="py-2 font-medium">공간</th>
                <th className="py-2 font-medium">결과 메일</th>
                <th className="py-2 font-medium">피드백 신청</th>
                <th className="py-2 font-medium">입금</th>
                <th className="py-2 font-medium">피드백</th>
                <th className="py-2 font-medium">참고 점수(참고용)</th>
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
                  <td className="py-2.5">{a.result_sent ? "보냄" : a.result_verdict ? "작성함" : "검토 중"}</td>
                  <td className="py-2.5">{a.feedback_requested_at ? "신청" : "—"}</td>
                  <td className="py-2.5">{a.payment_confirmed ? "확인" : "—"}</td>
                  <td className="py-2.5">{a.feedback_sent ? "발송함" : a.feedback ? "작성 중" : "—"}</td>
                  <td className="py-2.5">{a.reference_score ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </Shell>
  );
}
