import { data, Form } from "react-router";
import type { Route } from "./+types/result";
import { getResultByToken, requestFeedback } from "~/lib/applications.server";
import { verdictLabel } from "~/lib/verdicts";
import { BANK_TRANSFER, CONSENTS, FEE_AMOUNT_KRW, FEE_SERVICE_NAME } from "~/lib/policy";
import { Consent, ErrorNote, Section, Shell, SubmitButton, Title } from "~/components/ui";
import { CopyButton } from "~/components/CopyButton";

export const meta: Route.MetaFunction = () => [{ title: "검토 결과 — 썰모" }, { name: "robots", content: "noindex" }];

export async function loader({ params, context }: Route.LoaderArgs) {
  const result = await getResultByToken(context.cloudflare.env.DB, params.token);
  if (!result) throw new Response("Not found", { status: 404 });
  return { ...result, verdictLabel: verdictLabel(result.verdict) };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const form = await request.formData();
  const outcome = await requestFeedback(context.cloudflare.env.DB, params.token, form.get("consentFeeTerms") === "on");
  if (outcome === "not-found") throw new Response("Not found", { status: 404 });
  if (outcome === "no-consent") return data({ error: "이용료 안내에 동의해 주세요." }, { status: 400 });
  if (outcome === "not-ready") return data({ error: "아직 검토 중이에요." }, { status: 400 });
  return { error: null };
}

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export default function Result({ loaderData, actionData }: Route.ComponentProps) {
  const r = loaderData;

  if (!r.verdict) {
    return (
      <Shell>
        <Title eyebrow={r.spaceName}>아직 검토 중이에요</Title>
        <p className="text-sm text-muted">검토가 끝나면 이 링크에서 결과를 볼 수 있어요.</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <Title eyebrow={r.spaceName}>{r.contactName}님, 검토 결과가 나왔어요</Title>
      <div className="mb-8 rounded-xl border border-ink p-4">
        <p className="text-xs font-bold tracking-wide text-accent">{r.verdictLabel}</p>
        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{r.summary}</p>
      </div>

      {r.feedbackSent ? (
        <p className="text-sm text-muted">서면 피드백을 이메일로 보냈어요. 메일함을 확인해 주세요.</p>
      ) : r.feedbackRequested ? (
        <Section title={`입금 안내 · ${FEE_SERVICE_NAME}`}>
          <dl className="grid grid-cols-[5rem_1fr] gap-y-1.5 text-sm">
            <dt className="text-muted">금액</dt>
            <dd className="font-semibold">{won(FEE_AMOUNT_KRW)}</dd>
            <dt className="text-muted">입금 계좌</dt>
            <dd>
              {BANK_TRANSFER.bank} {BANK_TRANSFER.account}
            </dd>
            <dt className="text-muted">예금주</dt>
            <dd>{BANK_TRANSFER.holder}</dd>
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            입금자명은 신청서의 이름({r.contactName})과 같게 해 주세요. 입금이 확인되면 이메일로 피드백 문서를 보내드려요.
          </p>
          <div className="mt-5">
            <CopyButton text={BANK_TRANSFER.account} label="계좌번호 복사" />
          </div>
        </Section>
      ) : (
        <Form method="post">
          <Section title={`${FEE_SERVICE_NAME} 받기 (선택)`}>
            <p className="text-2xl font-bold tabular-nums">{won(FEE_AMOUNT_KRW)}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              동네 설문 결과를 바탕으로 사업계획서를 항목별로 짚은 피드백 문서를 이메일로 보내드려요.
            </p>
            <ul className="mb-4 mt-2 list-disc pl-5 text-xs leading-relaxed text-muted">
              <li>업종·가격·시간대가 동네 수요와 맞는지</li>
              <li>사업계획서에서 보완할 부분</li>
            </ul>
            <Consent name="consentFeeTerms" required label={CONSENTS.feeTerms.label} detail={CONSENTS.feeTerms.detail} />
          </Section>
          <ErrorNote message={actionData?.error} />
          <SubmitButton>피드백 신청하기</SubmitButton>
          <p className="mt-3 text-center text-xs text-muted">신청하지 않아도 위 결과는 계속 볼 수 있어요.</p>
        </Form>
      )}
    </Shell>
  );
}
