import { data, Form, Link } from "react-router";
import type { Route } from "./+types/admin-application";
import { requireAdmin } from "~/lib/auth.server";
import { createBrokerIntro, getApplication, listBrokerIntros, setResultMailed } from "~/lib/applications.server";
import { addConsultingMonth, addEducatorLink, listConsultingMonths, listEducatorLinks } from "~/lib/consulting.server";
import { parseConsultingMonth, parseEducatorLink } from "~/lib/consulting";
import { markPending } from "~/lib/evaluation.server";
import { scheduleEvaluation } from "~/lib/jobs.server";
import { mailerFromEnv } from "~/lib/mail.server";
import { SECTION_KEYS, SECTION_LABELS, type AiReport } from "~/lib/ai-report";
import { VERDICTS } from "~/lib/verdicts";
import { formatManwon, formatWon } from "~/lib/money";
import { CopyButton } from "~/components/CopyButton";
import { btnSmall, btnSmallGhost, ErrorNote, Section, Shell, Title } from "~/components/ui";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const app = await getApplication(env.DB, Number(params.id));
  if (!app) throw new Response("Not found", { status: 404 });
  return {
    app,
    intros: await listBrokerIntros(env.DB, app.id),
    months: app.track === "ssulmo" ? await listConsultingMonths(env.DB, app.id) : [],
    educators: app.track === "ssulmo" ? await listEducatorLinks(env.DB, app.id) : [],
    report: app.ai_report ? (JSON.parse(app.ai_report) as AiReport) : null,
    autoMail: mailerFromEnv(env) !== null,
    resultUrl: `${new URL(request.url).origin}/result/${app.result_token}`,
  };
}

const fail = (error: string) => data({ error, saved: null }, { status: 400 });

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const id = Number(params.id);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "re-evaluate") {
    await markPending(env.DB, id);
    scheduleEvaluation(context, id, new URL(request.url).origin);
    return { error: null, saved: "re-evaluate" };
  }
  if (intent === "set-mailed") {
    await setResultMailed(env.DB, id, form.get("mailed") === "on");
    return { error: null, saved: "mailed" };
  }
  if (intent === "add-month") {
    const parsed = parseConsultingMonth(form);
    if (!parsed.ok) return fail(parsed.error);
    const result = await addConsultingMonth(env.DB, id, parsed.value);
    if (result === "duplicate") return fail("이미 기록한 달이에요.");
    if (result === "not-ssulmo") return fail("쓸모 트랙 신청자만 월별 기록을 남길 수 있어요.");
    return { error: null, saved: "month" };
  }
  if (intent === "add-educator") {
    const parsed = parseEducatorLink(form);
    if (!parsed.ok) return fail(parsed.error);
    await addEducatorLink(env.DB, id, parsed.value);
    return { error: null, saved: "educator" };
  }
  if (intent === "add-intro") {
    const result = await createBrokerIntro(env.DB, id, String(form.get("brokerName") ?? ""), String(form.get("introducedOn") ?? ""));
    if (result === "no-consent") return fail("신청자의 소개 동의가 없어 기록할 수 없어요.");
    if (result === "invalid") return fail("중개사 이름과 날짜를 확인해 주세요.");
    return { error: null, saved: "intro" };
  }
  return fail("알 수 없는 요청이에요.");
}

const date = (ms: number) => new Date(ms).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
const field = "w-full rounded-[10px] border border-line px-3 py-2.5 focus:border-ink focus:outline-none";

const won = (krw: number) => (krw % 10_000 === 0 ? `${formatManwon(krw)}원` : formatWon(krw));
const signed = (krw: number) => (krw < 0 ? `−${formatManwon(-krw)}원` : krw > 0 ? `+${formatManwon(krw)}원` : "0원");
const AI_STATUS = {
  pending: { label: "대기", tone: "bg-soft" },
  done: { label: "완료", tone: "bg-green" },
  failed: { label: "실패", tone: "bg-yellow" },
} as const;

export default function AdminApplication({ loaderData, actionData }: Route.ComponentProps) {
  const { app, intros, months, educators, report, autoMail, resultUrl } = loaderData;
  const canIntroduce = app.consent_broker_intro === 1;
  const ssulmo = app.track === "ssulmo";
  const status = AI_STATUS[app.ai_status];
  const verdict = VERDICTS.find((v) => v.value === (report?.verdict ?? app.result_verdict))?.label;
  const saved = actionData?.saved;

  return (
    <Shell wide nav={false}>
      <Title eyebrow={`${app.space_name} · ${ssulmo ? "쓸모 트랙" : "일반 신청"}`} sub={`접수 ${date(app.created_at)}`}>
        {app.contact_name} · {app.business_type}
      </Title>
      <ErrorNote message={actionData?.error} />

      <div className="grid gap-x-10 md:grid-cols-2">
        <div className="min-w-0">
          <Section title="신청 내용 (개인정보)">
            <dl className="grid grid-cols-[7rem_1fr] gap-y-2 text-base">
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
            <p className="mt-4 whitespace-pre-wrap rounded-[14px] border border-line p-4 text-base">{app.plan_text}</p>
          </Section>

          <Section title="동의 기록">
            <ul className="space-y-1 text-base">
              <li>개인정보 수집·이용: {date(app.consent_privacy_at)}</li>
              <li>중개 소개 조건 안내: {date(app.consent_intro_terms_at)}</li>
              <li>중개사 소개 동의: {app.consent_broker_intro_at ? date(app.consent_broker_intro_at) : "동의 안 함"}</li>
              <li>AI 처리위탁 동의: {app.consent_ai_at ? date(app.consent_ai_at) : "기록 없음"}</li>
              <li>컨설팅 약관 동의: {app.consent_consulting_at ? date(app.consent_consulting_at) : "해당 없음"}</li>
            </ul>
          </Section>

          <Section title="중개사 소개 기록">
            {canIntroduce ? (
              <Form method="post" className="mb-4 flex flex-wrap items-end gap-3 text-base">
                <input type="hidden" name="intent" value="add-intro" />
                <label>
                  <span className="mb-1 block">중개사 이름</span>
                  <input name="brokerName" required maxLength={60} className="min-h-10 rounded-[10px] border border-line px-3 py-2" />
                </label>
                <label>
                  <span className="mb-1 block">소개한 날짜</span>
                  <input name="introducedOn" type="date" required className="min-h-10 rounded-[10px] border border-line px-3 py-2" />
                </label>
                <button className={btnSmall}>기록</button>
              </Form>
            ) : (
              <p className="mb-4 rounded-[10px] border border-dashed border-line p-3 text-base text-muted">
                신청자가 중개사 소개에 동의하지 않아 기록할 수 없어요.
              </p>
            )}
            <ul className="divide-y divide-line text-base">
              {intros.map((i) => (
                <li key={i.id} className="flex justify-between py-2">
                  <span>{i.broker_name}</span>
                  <span className="text-muted">{i.introduced_on}</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <div className="min-w-0">
          <Section title="AI 평가">
            <p className="mb-3 text-base">
              <span className={`rounded-full border border-line px-2.5 py-0.5 text-[15px] font-bold ${status.tone}`}>{status.label}</span>
            </p>
            {app.ai_status === "done" && report && (
              <>
                <p className="text-[15px]">
                  <b>{report.score}점</b> (참고용){verdict ? ` · ${verdict}` : ""}
                </p>
                <p className="mt-1.5 text-[15px] text-muted">
                  강점: {report.strengths.join(", ")} · 위험: {report.risks.join(", ")}
                </p>
                <p className="mt-1.5 text-[15px] text-muted">
                  {app.ai_model} · {app.ai_evaluated_at ? date(app.ai_evaluated_at) : ""}
                </p>
                <details className="mt-3 rounded-[14px] border border-line p-4 text-base">
                  <summary className="cursor-pointer font-medium">리포트 전체 보기</summary>
                  <p className="mt-3">{report.summary}</p>
                  {SECTION_KEYS.map((k) => (
                    <div key={k} className="mt-3">
                      <h3 className="text-[15px] font-bold text-muted">{SECTION_LABELS[k]}</h3>
                      <p className="mt-1 whitespace-pre-wrap">{report.sections[k]}</p>
                    </div>
                  ))}
                  {report.notes?.map((n) => (
                    <p key={n} className="mt-3 text-[15px] text-muted">
                      {n}
                    </p>
                  ))}
                </details>
              </>
            )}
            {app.ai_status === "failed" && <p className="text-base text-muted">평가에 실패했어요: {app.ai_error ?? "원인 미상"}</p>}
            {app.ai_status === "pending" && <p className="text-base text-muted">평가를 기다리고 있어요. 오래 걸리면 재평가를 눌러 주세요.</p>}
            <Form method="post" className="mt-3 flex items-center gap-3">
              <input type="hidden" name="intent" value="re-evaluate" />
              <button className={btnSmallGhost}>재평가</button>
              {saved === "re-evaluate" && <span className="text-base text-muted">다시 평가를 시작했어요.</span>}
            </Form>
          </Section>

          <Section title="결과 전달">
            {autoMail && (
              <p className="mb-3 text-base">
                {app.result_mailed_at ? `자동 메일 발송됨 · ${date(app.result_mailed_at)}` : "자동 메일 대기 중 (실패했다면 아래 링크를 직접 보내세요)"}
              </p>
            )}
            {(!autoMail || !app.result_mailed_at) && (
              <Form method="post" className="space-y-3 text-base">
                <input type="hidden" name="intent" value="set-mailed" />
                <div className="flex items-center gap-2 rounded-[10px] bg-soft px-3 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-[15px]">{resultUrl}</span>
                  <CopyButton text={resultUrl} label="링크 복사" />
                </div>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="mailed" defaultChecked={app.result_mailed_at !== null} className="size-4 accent-ink" />
                  결과 메일 보냄 (직접 보낸 뒤 체크)
                </label>
                <button className={btnSmallGhost}>저장</button>
                {saved === "mailed" && <span className="ml-3 text-muted">저장했어요.</span>}
              </Form>
            )}
          </Section>

          {ssulmo && (
            <>
              <Section title="쓸모 트랙 · 월별 기록">
                {months.length > 0 && (
                  <table className="mb-4 w-full text-left text-base">
                    <thead className="text-[15px] text-muted">
                      <tr>
                        <th className="py-2 font-medium">월</th>
                        <th className="py-2 font-medium">매출</th>
                        <th className="py-2 font-medium">손익</th>
                        <th className="py-2 font-medium">수수료(1%)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line tabular-nums">
                      {months.map((m) => (
                        <tr key={m.id}>
                          <td className="py-2.5">{m.month}</td>
                          <td className="py-2.5">{won(m.revenue_krw)}</td>
                          <td className="py-2.5">{signed(m.profit_krw)}</td>
                          <td className="py-2.5">{m.fee_krw === 0 ? "0원" : won(m.fee_krw)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <Form method="post" className="flex flex-wrap items-end gap-3 text-base">
                  <input type="hidden" name="intent" value="add-month" />
                  <label>
                    <span className="mb-1 block">월</span>
                    <input name="month" type="month" required className="min-h-10 rounded-[10px] border border-line px-3 py-2" />
                  </label>
                  <label>
                    <span className="mb-1 block">매출(만원)</span>
                    <input name="revenueManwon" inputMode="numeric" required className="min-h-10 w-28 rounded-[10px] border border-line px-3 py-2" />
                  </label>
                  <label>
                    <span className="mb-1 block">손익(만원, 손해면 -40)</span>
                    <input name="profitManwon" inputMode="numeric" required className="min-h-10 w-28 rounded-[10px] border border-line px-3 py-2" />
                  </label>
                  <button className={btnSmall}>기록 추가</button>
                </Form>
                {saved === "month" && <p className="mt-2 text-base text-muted">기록했어요.</p>}
                {/* TODO(legal): fee rate (FEE_RATE in consulting.ts), loss-month waiver and billing need lawyer review before any charge. */}
                <p className="mt-3 text-[15px] text-muted">기록과 계산만 해요. 실제 청구·결제는 하지 않아요.</p>
              </Section>

              <Section title="교육자 연결">
                {educators.length > 0 && (
                  <ul className="mb-4 divide-y divide-line text-base">
                    {educators.map((e) => (
                      <li key={e.id} className="py-2">
                        {e.organization} · {e.educator_name} · {e.connected_on}
                      </li>
                    ))}
                  </ul>
                )}
                <Form method="post" className="flex flex-wrap items-end gap-3 text-base">
                  <input type="hidden" name="intent" value="add-educator" />
                  <label>
                    <span className="mb-1 block">기관</span>
                    <input name="organization" required maxLength={60} className="min-h-10 rounded-[10px] border border-line px-3 py-2" />
                  </label>
                  <label>
                    <span className="mb-1 block">교육자 이름</span>
                    <input name="educatorName" required maxLength={40} className="min-h-10 rounded-[10px] border border-line px-3 py-2" />
                  </label>
                  <label>
                    <span className="mb-1 block">연결한 날짜</span>
                    <input name="connectedOn" type="date" required className="min-h-10 rounded-[10px] border border-line px-3 py-2" />
                  </label>
                  <button className={btnSmall}>연결 기록</button>
                </Form>
                {saved === "educator" && <p className="mt-2 text-base text-muted">기록했어요.</p>}
              </Section>
            </>
          )}
        </div>
      </div>

      <Link to="/admin" className="text-base text-muted underline">
        ← 목록으로
      </Link>
    </Shell>
  );
}
