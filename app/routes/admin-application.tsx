import { data, Form, Link } from "react-router";
import type { Route } from "./+types/admin-application";
import { requireAdmin } from "~/lib/auth.server";
import {
  createBrokerIntro,
  getApplication,
  listBrokerIntros,
  parseFeedbackForm,
  parseResultForm,
  saveFeedback,
  saveResult,
} from "~/lib/applications.server";
import { VERDICTS } from "~/lib/verdicts";
import { FEE_AMOUNT_KRW } from "~/lib/policy";
import { CopyButton } from "~/components/CopyButton";
import { ErrorNote, Section, Shell, Title } from "~/components/ui";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const app = await getApplication(env.DB, Number(params.id));
  if (!app) throw new Response("Not found", { status: 404 });
  return { app, intros: await listBrokerIntros(env.DB, app.id), resultUrl: `${new URL(request.url).origin}/result/${app.result_token}` };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const id = Number(params.id);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "save-result") {
    const r = parseResultForm(form);
    if (!r.ok) return data({ error: r.error, saved: null }, { status: 400 });
    await saveResult(env.DB, id, r.value);
    return { error: null, saved: "result" };
  }
  if (intent === "save-feedback") {
    if ((await saveFeedback(env.DB, id, parseFeedbackForm(form))) === "not-requested") {
      return data({ error: "신청자가 아직 피드백을 신청하지 않았어요.", saved: null }, { status: 400 });
    }
    return { error: null, saved: "feedback" };
  }
  if (intent === "add-intro") {
    const result = await createBrokerIntro(env.DB, id, String(form.get("brokerName") ?? ""), String(form.get("introducedOn") ?? ""));
    if (result === "no-consent") return data({ error: "신청자의 소개 동의가 없어 기록할 수 없어요.", saved: null }, { status: 400 });
    if (result === "invalid") return data({ error: "중개사 이름과 날짜를 확인해 주세요.", saved: null }, { status: 400 });
    return { error: null, saved: "intro" };
  }
  return data({ error: "알 수 없는 요청이에요.", saved: null }, { status: 400 });
}

const date = (ms: number) => new Date(ms).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
const field = "w-full rounded-lg border border-line px-3 py-2.5 focus:border-ink focus:outline-none";

export default function AdminApplication({ loaderData, actionData }: Route.ComponentProps) {
  const { app, intros, resultUrl } = loaderData;
  const canIntroduce = app.consent_broker_intro === 1;
  const saved = actionData?.saved;

  return (
    <Shell wide>
      <Title eyebrow={app.space_name} sub={`접수 ${date(app.created_at)}`}>
        {app.contact_name} · {app.business_type}
      </Title>
      <ErrorNote message={actionData?.error} />

      <div className="grid gap-x-10 md:grid-cols-2">
        <div className="min-w-0">
          <Section title="신청 내용 (개인정보)">
            <dl className="grid grid-cols-[7rem_1fr] gap-y-2 text-sm">
              <dt className="text-muted">이메일</dt>
              <dd className="break-all">{app.email}</dd>
              <dt className="text-muted">예상 창업 비용</dt>
              <dd>{app.est_cost_manwon.toLocaleString("ko-KR")}만원</dd>
              <dt className="text-muted">사업계획서 파일</dt>
              <dd>
                {app.plan_file_key ? (
                  <a className="underline" href={`/admin/files/${app.plan_file_key}`}>
                    내려받기
                  </a>
                ) : (
                  "없음"
                )}
              </dd>
            </dl>
            <p className="mt-4 whitespace-pre-wrap rounded-lg border border-line p-4 text-sm leading-relaxed">{app.plan_text}</p>
          </Section>

          <Section title="동의 기록">
            <ul className="space-y-1 text-sm">
              <li>개인정보 수집·이용: {date(app.consent_privacy_at)}</li>
              <li>중개 소개 조건 안내: {date(app.consent_intro_terms_at)}</li>
              <li>중개사 소개 동의: {app.consent_broker_intro_at ? date(app.consent_broker_intro_at) : "동의 안 함"}</li>
              <li>피드백 이용료 안내: {app.consent_fee_terms_at ? date(app.consent_fee_terms_at) : "해당 없음"}</li>
            </ul>
          </Section>
        </div>

        <div className="min-w-0">
          <Section title="1. 검토 결과 (무료)">
            <Form method="post" className="space-y-4 text-sm">
              <input type="hidden" name="intent" value="save-result" />
              <fieldset>
                <legend className="mb-2 font-medium">한 줄 판정</legend>
                <div className="flex flex-wrap gap-2">
                  {VERDICTS.map((v) => (
                    <label key={v.value} className="cursor-pointer">
                      <input type="radio" name="verdict" value={v.value} defaultChecked={app.result_verdict === v.value} className="peer sr-only" />
                      <span className="block rounded-full border border-line px-3.5 py-1.5 peer-checked:border-ink peer-checked:bg-ink peer-checked:text-paper">
                        {v.label}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="block">
                <span className="mb-1.5 block font-medium">요약 (신청자에게 보여요)</span>
                <textarea name="summary" defaultValue={app.result_summary ?? ""} maxLength={1000} className={`${field} min-h-28`} />
              </label>
              <label className="block">
                <span className="mb-1.5 block font-medium">참고 점수 (참고용, 0~100 · 신청자에게 안 보여요)</span>
                <input name="referenceScore" inputMode="numeric" defaultValue={app.reference_score ?? ""} className={`${field} w-28`} />
              </label>
              <div className="flex items-center gap-2 rounded-lg bg-[#f6f6f6] px-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-xs">{resultUrl}</span>
                <CopyButton text={resultUrl} label="링크 복사" />
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="resultSent" defaultChecked={app.result_sent === 1} className="size-4 accent-ink" />
                결과 메일 보냄 (직접 보낸 뒤 체크)
              </label>
              <button className="rounded-lg bg-ink px-4 py-2 font-semibold text-paper">저장</button>
              {saved === "result" && <span className="ml-3 text-muted">저장했어요.</span>}
            </Form>
          </Section>

          <Section title={`2. 서면 피드백 (유료 · ${FEE_AMOUNT_KRW.toLocaleString("ko-KR")}원)`}>
            {app.feedback_requested_at ? (
              <Form method="post" className="space-y-4 text-sm">
                <input type="hidden" name="intent" value="save-feedback" />
                <p className="text-muted">신청자가 피드백을 신청했어요 · {date(app.feedback_requested_at)}</p>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="paymentConfirmed" defaultChecked={app.payment_confirmed === 1} className="size-4 accent-ink" />
                  입금 확인
                </label>
                <label className="block">
                  <span className="mb-1.5 block font-medium">서면 피드백</span>
                  <textarea name="feedback" defaultValue={app.feedback ?? ""} className={`${field} min-h-40`} />
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="feedbackSent" defaultChecked={app.feedback_sent === 1} className="size-4 accent-ink" />
                  피드백 발송함 (직접 보낸 뒤 체크)
                </label>
                <button className="rounded-lg bg-ink px-4 py-2 font-semibold text-paper">저장</button>
                {saved === "feedback" && <span className="ml-3 text-muted">저장했어요.</span>}
              </Form>
            ) : (
              <p className="rounded-lg border border-dashed border-line p-3 text-sm text-muted">아직 피드백을 신청하지 않았어요.</p>
            )}
          </Section>

          <Section title="중개사 소개 기록">
            {canIntroduce ? (
              <Form method="post" className="mb-4 flex flex-wrap items-end gap-3 text-sm">
                <input type="hidden" name="intent" value="add-intro" />
                <label>
                  <span className="mb-1 block">중개사 이름</span>
                  <input name="brokerName" required maxLength={60} className="rounded-lg border border-line px-3 py-2" />
                </label>
                <label>
                  <span className="mb-1 block">소개한 날짜</span>
                  <input name="introducedOn" type="date" required className="rounded-lg border border-line px-3 py-2" />
                </label>
                <button className="rounded-lg bg-ink px-4 py-2 font-semibold text-paper">기록</button>
              </Form>
            ) : (
              <p className="mb-4 rounded-lg border border-dashed border-line p-3 text-sm text-muted">
                신청자가 중개사 소개에 동의하지 않아 기록할 수 없어요.
              </p>
            )}
            <ul className="divide-y divide-line text-sm">
              {intros.map((i) => (
                <li key={i.id} className="flex justify-between py-2">
                  <span>{i.broker_name}</span>
                  <span className="text-muted">{i.introduced_on}</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>

      <Link to="/admin" className="text-sm text-muted underline">
        ← 목록으로
      </Link>
    </Shell>
  );
}
