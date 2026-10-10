import { data, Form, redirect } from "react-router";
import type { Route } from "./+types/owner-login";
import { getOwner, ownerProfileComplete, requestLoginLink } from "~/lib/owner-auth.server";
import { mailerFromEnv } from "~/lib/mail.server";
import { clientIp } from "~/lib/rate-limit.server";
import { ErrorNote, Hl, Shell, SubmitButton, TextInput, Title } from "~/components/ui";
import { ownerMeta } from "~/components/owner";

export const meta = ownerMeta("건물주로 시작하기");

export async function loader({ request, context }: Route.LoaderArgs) {
  const owner = await getOwner(request, context.cloudflare.env);
  if (owner) throw redirect(ownerProfileComplete(owner) ? "/owner/spaces" : "/owner/welcome");
  return null;
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const form = await request.formData();
  const result = await requestLoginLink(env.DB, {
    email: String(form.get("email") ?? ""),
    ip: clientIp(request),
    origin: new URL(request.url).origin,
    mailer: mailerFromEnv(env),
    showDevLink: env.DEV_SHOW_LOGIN_LINK === "1",
  });
  if (result.status === "invalid") {
    return data({ status: "invalid" as const, devLink: null }, { status: 400 });
  }
  // Identical answer for unknown, known and rate-limited addresses (no account enumeration).
  return { status: "sent" as const, devLink: result.devLink };
}

export default function OwnerLogin({ actionData }: Route.ComponentProps) {
  return (
    <Shell nav="minimal">
      <Title
        eyebrow="건물주"
        sub="공실을 등록하면 주민 의견을 모으고, AI가 평가한 임차 후보를 보여드려요. 등록은 무료예요."
      >
        비어 있는 공간, <Hl>동네에 물어볼게요</Hl>
      </Title>
      {actionData?.status === "sent" && (
        <div data-testid="login-sent" role="status" className="mb-6 rounded-[10px] border border-ink bg-soft px-4 py-3 text-base">
          메일을 보냈다면 곧 도착해요. 받은편지함과 스팸함을 확인해 주세요. 링크는 15분 동안, 한 번만 쓸 수 있어요.
        </div>
      )}
      {actionData?.devLink && (
        <p className="mb-6 rounded-[10px] border border-dashed border-ink px-4 py-3 text-base">
          <span className="block text-[15px] text-muted">개발용 · 메일 설정이 없는 로컬에서만 보여요</span>
          <a data-testid="dev-login-link" href={actionData.devLink} className="break-all font-medium underline">
            {actionData.devLink}
          </a>
        </p>
      )}
      <Form method="post">
        <TextInput label="이메일" name="email" type="email" inputMode="email" autoComplete="email" placeholder="owner@example.com" required />
        <ErrorNote message={actionData?.status === "invalid" ? "이메일 형식을 확인해 주세요. (예: owner@example.com)" : null} />
        <SubmitButton>로그인 링크 받기</SubmitButton>
        <p className="mt-4 text-[15px] text-muted">비밀번호는 없어요. 처음이면 자동으로 가입돼요.</p>
      </Form>
    </Shell>
  );
}
