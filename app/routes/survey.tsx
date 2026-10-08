import { data, Form, Link } from "react-router";
import type { Route } from "./+types/survey";
import { getPublicSpace } from "~/lib/spaces.server";
import {
  BUSINESS_CATEGORIES,
  OTHER,
  parseSurvey,
  parseSurveyContact,
  RESPONDENT_TYPE,
  SPEND_RANGE,
  VISIT_FREQUENCY,
  VISIT_TIME,
} from "~/lib/survey";
import { hashDeviceId, saveContact, saveResponse } from "~/lib/surveys.server";
import { getDeviceId } from "~/lib/device.server";
import { CONSENTS } from "~/lib/policy";
import { btnGhost, Card, Choice, Consent, ErrorNote, Hl, Question, Shell, SubmitButton, TextInput, Title } from "~/components/ui";

export const meta: Route.MetaFunction = ({ data }) => [{ title: data ? `${data.name} — 썰모 설문` : "썰모" }];

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const space = await getPublicSpace(context.cloudflare.env.DB, params.slug);
  if (!space) throw new Response("Not found", { status: 404 });
  // Issue the device cookie with the page, so a first-visit double tap sends
  // the same id twice instead of two fresh ones.
  const device = await getDeviceId(request);
  return data(
    { name: space.name, neighborhood: space.neighborhood, slug: space.slug },
    { headers: device.setCookie ? { "Set-Cookie": device.setCookie } : undefined },
  );
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const space = await getPublicSpace(env.DB, params.slug);
  if (!space) throw new Response("Not found", { status: 404 });

  const form = await request.formData();
  const parsed = parseSurvey(form);
  if (!parsed.ok) return data({ status: "error" as const, error: parsed.error }, { status: 400 });
  const contact = parseSurveyContact(form);
  if (!contact.ok) return data({ status: "error" as const, error: contact.error }, { status: 400 });

  const device = await getDeviceId(request);
  const result = await saveResponse(env.DB, space.id, await hashDeviceId(device.id), parsed.value);
  if (result === "saved" && contact.value) await saveContact(env.DB, space.id, contact.value);

  return data(
    { status: result, error: null },
    { headers: device.setCookie ? { "Set-Cookie": device.setCookie } : undefined },
  );
}

const options = (list: { value: string; label: string }[], name: string) =>
  list.map((o) => <Choice key={o.value} type="radio" name={name} value={o.value} label={o.label} />);

export default function Survey({ loaderData, actionData }: Route.ComponentProps) {
  const { name, neighborhood, slug } = loaderData;

  if (actionData?.status === "saved" || actionData?.status === "cooldown") {
    return (
      <Shell nav={false}>
        <Title eyebrow={neighborhood}>
          {actionData.status === "saved" ? "응답이 저장됐어요. 고마워요!" : "이미 응답하셨어요."}
        </Title>
        <p className="text-muted">
          {actionData.status === "saved"
            ? "응답이 50명 이상 모이면 결과를 공개해요."
            : "같은 기기에서는 24시간에 한 번 참여할 수 있어요."}
        </p>
        <Link to={`/r/${slug}`} className={`${btnGhost} mt-8 w-full`}>
          결과 보러 가기
        </Link>
      </Shell>
    );
  }

  return (
    <Shell nav={false}>
      <Title eyebrow={neighborhood} sub="30초면 끝나요. 이름은 묻지 않아요.">
        {name}에 <Hl>어떤 가게</Hl>가 생기면 좋을까요?
      </Title>
      <Form method="post">
        <Question label="생기면 이용할 가게" hint="최대 3개" stack>
          {BUSINESS_CATEGORIES.map((c) => (
            <Card key={c.name} className="!p-4">
              <h3 className="text-cap font-bold tracking-[0.06em] text-muted">{c.name}</h3>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {c.types.map((t) => (
                  <Choice key={t} type="checkbox" name="businessTypes" value={t} label={t} />
                ))}
              </div>
            </Card>
          ))}
          <Card className="!p-4">
            <h3 className="text-cap font-bold tracking-[0.06em] text-muted">그 밖에</h3>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <Choice type="checkbox" name="businessTypes" value={OTHER} label={OTHER} />
            </div>
          </Card>
        </Question>
        <TextInput label="기타를 골랐다면 적어 주세요" name="businessTypeOther" maxLength={40} placeholder="예: 아이스크림집" />
        <Question label="얼마나 자주 갈 것 같나요?">{options(VISIT_FREQUENCY, "visitFrequency")}</Question>
        <Question label="한 번에 쓸 것 같은 금액">{options(SPEND_RANGE, "spendRange")}</Question>
        <Question label="주로 가는 시간대">{options(VISIT_TIME, "visitTime")}</Question>
        <Question label="나는">{options(RESPONDENT_TYPE, "respondentType")}</Question>

        <details className="mb-8 rounded-[14px] border border-line p-4">
          <summary className="flex min-h-12 cursor-pointer items-center font-medium">가게가 생기면 소식 받기 (선택)</summary>
          <div className="mt-4">
            <TextInput label="연락처 (전화번호 또는 이메일)" name="contact" maxLength={100} />
            <Consent name="contactConsent" label={CONSENTS.surveyContact.label} detail={CONSENTS.surveyContact.detail} />
          </div>
        </details>

        <ErrorNote message={actionData?.error} />
        <SubmitButton>제출하기</SubmitButton>
      </Form>
    </Shell>
  );
}
