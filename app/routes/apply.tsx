import { useEffect, useState } from "react";
import { data, Form, Link } from "react-router";
import type { Route } from "./+types/apply";
import { getPublicSpace } from "~/lib/spaces.server";
import { createApplication, parseApplication } from "~/lib/applications.server";
import { scheduleEvaluation } from "~/lib/jobs.server";
import { FEE_RATE } from "~/lib/consulting";
import { checkUpload, storeUpload } from "~/lib/uploads.server";
import { CONSENTS } from "~/lib/policy";
import { parseTypePrefill } from "~/lib/matching";
import { btnGhost, Consent, ErrorNote, Section, Shell, SubmitButton, TextArea, TextInput, Title } from "~/components/ui";

export const meta: Route.MetaFunction = ({ data }) => [{ title: data ? `${data.name} 창업 신청 — 쓸모` : "쓸모" }];

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const space = await getPublicSpace(context.cloudflare.env.DB, params.slug);
  if (!space) throw new Response("Not found", { status: 404 });
  return { name: space.name, neighborhood: space.neighborhood, slug: space.slug, prefillType: parseTypePrefill(new URL(request.url).searchParams.get("type")), feePct: Math.round(FEE_RATE * 100) };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const space = await getPublicSpace(env.DB, params.slug);
  if (!space) throw new Response("Not found", { status: 404 });

  const form = await request.formData();
  const parsed = parseApplication(form);
  if (!parsed.ok) return data({ email: null, error: parsed.error }, { status: 400 });
  const upload = checkUpload(form.get("planFile"));
  if (!upload.ok) return data({ email: null, error: upload.error }, { status: 400 });

  const planFileKey = upload.value ? await storeUpload(env.UPLOADS, "plans", upload.value) : null;
  const { id } = await createApplication(env.DB, space.id, parsed.value, planFileKey);
  scheduleEvaluation(context, id, new URL(request.url).origin);
  return { email: parsed.value.email, error: null };
}

function TrackCard(props: { value: "ssulmo" | "general"; title: string; desc: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="cursor-pointer">
      <input type="radio" name="track" value={props.value} checked={props.checked} onChange={props.onChange} className="peer sr-only" />
      <span className="block rounded-[14px] border border-line bg-paper p-4 transition-colors peer-checked:border-yellow-deep peer-checked:bg-yellow peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink">
        <b className="block text-lg font-bold">{props.title}</b>
        <span className="mt-1 block text-base">{props.desc}</span>
      </span>
    </label>
  );
}

export default function Apply({ loaderData, actionData }: Route.ComponentProps) {
  const [track, setTrack] = useState<"ssulmo" | "general">("ssulmo");
  // Before hydration the consulting box is not `required`, so a no-JS 일반 submit is never blocked;
  // the server enforces it for 쓸모 트랙 either way.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  if (actionData?.email) {
    return (
      <Shell>
        <Title eyebrow={loaderData.neighborhood}>신청이 접수됐어요</Title>
        <p className="text-muted">
          AI 평가를 시작했어요. 평가 결과 링크를 <b className="text-ink">{actionData.email}</b>으로 보내드려요.
        </p>
        <p className="mt-2 text-muted">메일이 오지 않으면 스팸함도 확인해 주세요.</p>
        <Link to={`/r/${loaderData.slug}`} className={`${btnGhost} mt-8 w-full`}>
          동네 의견 다시 보기
        </Link>
      </Shell>
    );
  }

  return (
    <Shell>
      <Title eyebrow={loaderData.neighborhood} sub="신청은 무료예요. 평가가 끝나면 이메일로 결과 링크를 보내드려요.">
        {loaderData.name} 창업 신청
      </Title>
      <Form method="post" encType="multipart/form-data" className="group">
        <fieldset className="mb-8">
          <legend className="text-base font-bold">어떻게 지원할까요?</legend>
          <div className="mt-3 grid gap-3">
            <TrackCard
              value="ssulmo"
              title="쓸모 트랙"
              desc={`손해 본 달은 0원, 번 달만 매출의 ${loaderData.feePct}%. 후보 추천·인증·컨설팅 포함`}
              checked={track === "ssulmo"}
              onChange={() => setTrack("ssulmo")}
            />
            <TrackCard value="general" title="일반 신청" desc="AI 평가만 받아요. 수수료 없음" checked={track === "general"} onChange={() => setTrack("general")} />
          </div>
        </fieldset>

        <Section title="아이템">
        <TextInput label="하고 싶은 업종" name="businessType" defaultValue={loaderData.prefillType} maxLength={40} placeholder="예: 젤라또 가게" required />
        <TextArea label="사업계획" name="planText" maxLength={5000} placeholder="누구에게, 무엇을, 어떻게 팔지 자유롭게 적어 주세요." required />
        <label className="mb-5 block">
          <span className="mb-1.5 block text-base font-medium">사업계획서 파일 (선택, 10MB 이하)</span>
          <input type="file" name="planFile" accept=".pdf,.png,.jpg,.jpeg,.hwp,.hwpx,.docx" className="text-base" />
        </label>
        <TextInput label="예상 창업 비용 (만원)" name="estCostManwon" inputMode="numeric" pattern="[0-9]*" placeholder="예: 4500" required />
        </Section>
        <Section title="나">
        <TextInput label="이름" name="contactName" maxLength={40} autoComplete="name" required />
        <TextInput label="이메일 (결과 링크를 받을 주소)" name="email" type="email" maxLength={100} autoComplete="email" placeholder="name@example.com" required />
        </Section>

        <Section title="동의">
        <div className="mb-2 border-b border-line">
          <Consent name="consentPrivacy" required label={CONSENTS.privacy.label} detail={CONSENTS.privacy.detail} />
          <Consent name="consentIntroTerms" required label={CONSENTS.introTerms.label} detail={CONSENTS.introTerms.detail} />
          <Consent name="consentAi" required label={CONSENTS.ai.label} detail={CONSENTS.ai.detail} />
          {/* Only for 쓸모 트랙: hidden by CSS (works without JS) and not `required` while 일반 is selected. */}
          {track === "ssulmo" && (
            <div className="group-has-[input[name=track][value=general]:checked]:hidden">
              <Consent name="consentConsulting" required={hydrated} label={CONSENTS.consulting.label} detail={CONSENTS.consulting.detail} />
            </div>
          )}
          <Consent name="consentBrokerIntro" label={CONSENTS.brokerIntroOptIn.label} detail={CONSENTS.brokerIntroOptIn.detail} />
        </div>
        </Section>

        <ErrorNote message={actionData?.error} />
        <SubmitButton>무료로 신청하기</SubmitButton>
      </Form>
    </Shell>
  );
}
