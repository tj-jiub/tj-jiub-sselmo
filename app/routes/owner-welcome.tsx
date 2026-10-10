import { data, Form, redirect } from "react-router";
import type { Route } from "./+types/owner-welcome";
import { ownerProfileComplete, parseOwnerProfile, requireOwner, saveOwnerProfile } from "~/lib/owner-auth.server";
import { Consent, ErrorNote, Shell, SubmitButton, TextInput, Title } from "~/components/ui";
import { ownerMeta } from "~/components/owner";

export const meta = ownerMeta("가입 확인");

export async function loader({ request, context }: Route.LoaderArgs) {
  const owner = await requireOwner(request, context.cloudflare.env);
  if (ownerProfileComplete(owner)) throw redirect("/owner/spaces");
  return { name: owner.name ?? "", phone: owner.phone ?? "" };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const owner = await requireOwner(request, env);
  const parsed = parseOwnerProfile(await request.formData());
  if (!parsed.ok) return data({ error: parsed.error }, { status: 400 });
  await saveOwnerProfile(env.DB, owner.id, parsed.value);
  return redirect("/owner/spaces");
}

export default function OwnerWelcome({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <Shell nav="minimal">
      <Title eyebrow="처음 한 번만">몇 가지만 확인할게요</Title>
      <Form method="post">
        <TextInput label="이름" name="name" autoComplete="name" maxLength={40} defaultValue={loaderData.name} required />
        <label className="mb-5 block">
          <span className="mb-1.5 block text-base font-medium">연락처</span>
          <input
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="010-0000-0000"
            defaultValue={loaderData.phone}
            required
            className="min-h-12 w-full rounded-[10px] border border-line bg-paper px-3.5 py-2.5 text-base focus:border-ink focus:outline-none"
          />
          <span className="mt-1 block text-[15px] text-muted">운영자가 상담할 때만 써요.</span>
        </label>
        {/* TODO(legal): wording and scope of the terms-of-service consent. */}
        <Consent name="consentTerms" label="이용약관 동의" required />
        {/* TODO(legal): wording of the personal-data consent (items, purpose, retention). */}
        <div className="mb-6">
          <Consent
            name="consentPrivacy"
            label="개인정보 수집·이용 동의"
            detail="이름, 연락처, 이메일 · 계정 운영과 상담"
            required
          />
        </div>
        <ErrorNote message={actionData?.error} />
        <SubmitButton>시작하기</SubmitButton>
      </Form>
    </Shell>
  );
}
