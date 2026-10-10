import { data, Form, redirect } from "react-router";
import type { Route } from "./+types/admin-login";
import { isAdmin, login } from "~/lib/auth.server";
import { adminLoginBlocked, clientIp, recordAdminLoginFailure } from "~/lib/rate-limit.server";
import { ErrorNote, Shell, SubmitButton, TextInput, Title } from "~/components/ui";

export async function loader({ request, context }: Route.LoaderArgs) {
  if (await isAdmin(request, context.cloudflare.env)) throw redirect("/admin");
  return null;
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const ip = clientIp(request);
  // Checked before the password so a blocked IP cannot learn whether a guess was right.
  if (await adminLoginBlocked(env.DB, ip)) {
    return data({ error: "로그인 시도가 너무 많아요. 15분 뒤에 다시 시도해 주세요." }, { status: 429 });
  }
  const form = await request.formData();
  const res = await login(request, env, String(form.get("email") ?? ""), String(form.get("password") ?? ""));
  if (res) return res;
  await recordAdminLoginFailure(env.DB, ip);
  return data({ error: "이메일 또는 비밀번호가 맞지 않아요." }, { status: 401 });
}

export default function AdminLogin({ actionData }: Route.ComponentProps) {
  return (
    <Shell>
      <Title eyebrow="관리자">관리자 로그인</Title>
      <Form method="post">
        <TextInput label="이메일" name="email" type="email" autoComplete="username" required />
        <TextInput label="비밀번호" name="password" type="password" autoComplete="current-password" required />
        <ErrorNote message={actionData?.error} />
        <SubmitButton>로그인</SubmitButton>
      </Form>
    </Shell>
  );
}
