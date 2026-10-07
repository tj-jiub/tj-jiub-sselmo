import { data, Form, Link } from "react-router";
import type { Route } from "./+types/apply";
import { getPublicSpace } from "~/lib/spaces.server";
import { createApplication, parseApplication } from "~/lib/applications.server";
import { checkUpload, storeUpload } from "~/lib/uploads.server";
import { CONSENTS } from "~/lib/policy";
import { Consent, ErrorNote, Shell, SubmitButton, TextArea, TextInput, Title } from "~/components/ui";

export const meta: Route.MetaFunction = ({ data }) => [{ title: data ? `${data.name} 창업 신청 — 썰모` : "썰모" }];

export async function loader({ params, context }: Route.LoaderArgs) {
  const space = await getPublicSpace(context.cloudflare.env.DB, params.slug);
  if (!space) throw new Response("Not found", { status: 404 });
  return { name: space.name, neighborhood: space.neighborhood, slug: space.slug };
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
  await createApplication(env.DB, space.id, parsed.value, planFileKey);
  return { email: parsed.value.email, error: null };
}

export default function Apply({ loaderData, actionData }: Route.ComponentProps) {
  if (actionData?.email) {
    return (
      <Shell>
        <Title eyebrow={loaderData.neighborhood}>신청이 접수됐어요</Title>
        <p className="text-sm leading-relaxed text-muted">
          검토가 끝나면 <b className="text-ink">{actionData.email}</b>으로 결과 링크를 보내드려요.
        </p>
        <p className="mt-2 text-sm text-muted">메일이 오지 않으면 스팸함도 확인해 주세요.</p>
        <Link to={`/r/${loaderData.slug}`} className="mt-8 block rounded-lg border border-ink py-3.5 text-center font-semibold">
          동네 의견 다시 보기
        </Link>
      </Shell>
    );
  }

  return (
    <Shell>
      <Title eyebrow={loaderData.neighborhood} sub="신청은 무료예요. 검토가 끝나면 이메일로 결과 링크를 보내드려요.">
        {loaderData.name} 창업 신청
      </Title>
      <Form method="post" encType="multipart/form-data">
        <TextInput label="하고 싶은 업종" name="businessType" maxLength={40} placeholder="예: 젤라또 가게" required />
        <TextArea label="사업계획" name="planText" maxLength={5000} placeholder="누구에게, 무엇을, 어떻게 팔지 자유롭게 적어 주세요." required />
        <label className="mb-5 block">
          <span className="mb-1.5 block text-sm font-medium">사업계획서 파일 (선택, 10MB 이하)</span>
          <input type="file" name="planFile" accept=".pdf,.png,.jpg,.jpeg,.hwp,.hwpx,.docx" className="text-sm" />
        </label>
        <TextInput label="예상 창업 비용 (만원)" name="estCostManwon" inputMode="numeric" pattern="[0-9]*" placeholder="예: 4500" required />
        <TextInput label="이름" name="contactName" maxLength={40} autoComplete="name" required />
        <TextInput label="이메일 (결과 링크를 받을 주소)" name="email" type="email" maxLength={100} autoComplete="email" placeholder="name@example.com" required />

        <div className="mb-8 mt-8">
          <Consent name="consentPrivacy" required label={CONSENTS.privacy.label} detail={CONSENTS.privacy.detail} />
          <Consent name="consentIntroTerms" required label={CONSENTS.introTerms.label} detail={CONSENTS.introTerms.detail} />
          <Consent name="consentBrokerIntro" label={CONSENTS.brokerIntroOptIn.label} detail={CONSENTS.brokerIntroOptIn.detail} />
        </div>

        <ErrorNote message={actionData?.error} />
        <SubmitButton>무료로 신청하기</SubmitButton>
      </Form>
    </Shell>
  );
}
