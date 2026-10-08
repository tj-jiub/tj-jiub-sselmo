import { data, Form, redirect } from "react-router";
import type { Route } from "./+types/admin-space-new";
import { requireAdmin } from "~/lib/auth.server";
import { createSpace, parseSpaceForm, slugTaken } from "~/lib/spaces.server";
import { checkUpload, storeUpload } from "~/lib/uploads.server";
import { Consent, ErrorNote, Shell, SubmitButton, TextInput, Title } from "~/components/ui";

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireAdmin(request, context.cloudflare.env);
  return null;
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const form = await request.formData();

  const parsed = parseSpaceForm(form);
  if (!parsed.ok) return data({ error: parsed.error }, { status: 400 });
  const upload = checkUpload(form.get("consentFile"));
  if (!upload.ok) return data({ error: upload.error }, { status: 400 });
  // Check before uploading so a rejected form never leaves an orphan file.
  if (await slugTaken(env.DB, parsed.value.slug)) {
    return data({ error: "이미 쓰고 있는 주소용 이름이에요." }, { status: 400 });
  }

  const consentFileKey = upload.value ? await storeUpload(env.UPLOADS, "owner-consents", upload.value) : null;
  const id = await createSpace(env.DB, { ...parsed.value, consentFileKey });
  return redirect(`/admin/spaces/${id}`);
}

export default function AdminSpaceNew({ actionData }: Route.ComponentProps) {
  return (
    <Shell>
      <Title eyebrow="공간 등록" sub="임대료·보증금 등 계약 조건은 입력하지 않아요.">
        새 공실 등록
      </Title>
      <Form method="post" encType="multipart/form-data">
        <TextInput label="공간 이름" name="name" placeholder="예: 망원동 1층 코너 공실" required />
        <TextInput label="구" name="district" placeholder="예: 마포구" maxLength={20} pattern=".*구" required />
        <TextInput label="동네 (동 단위까지만)" name="neighborhood" placeholder="예: 마포구 망원동" required />
        <TextInput
          label="주소용 이름 (QR 링크에 쓰여요)"
          name="slug"
          placeholder="mangwon-01"
          pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]"
          required
        />
        <Consent
          name="ownerConsent"
          label="건물주 동의를 받았어요"
          detail="체크하지 않으면 설문·리포트·신청 링크가 공개되지 않아요. 나중에 공간 화면에서 바꿀 수 있어요."
        />
        {/* TODO(legal): confirm what form of building-owner consent is sufficient (written form, scope, retention). */}
        <label className="mb-6 block">
          <span className="mb-1.5 block text-sm font-medium">건물주 동의서 파일 (선택)</span>
          <input type="file" name="consentFile" accept=".pdf,.png,.jpg,.jpeg,.hwp,.hwpx,.docx" className="text-sm" />
        </label>
        <ErrorNote message={actionData?.error} />
        <SubmitButton>등록하기</SubmitButton>
      </Form>
    </Shell>
  );
}
