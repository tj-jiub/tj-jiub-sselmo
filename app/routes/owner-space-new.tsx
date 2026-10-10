import { data, Form, redirect } from "react-router";
import type { Route } from "./+types/owner-space-new";
import { ownerProfileComplete, requireOwner } from "~/lib/owner-auth.server";
import { createOwnerSpace, parseOwnerSpaceForm } from "~/lib/owner-spaces.server";
import { checkPhotos, storeUpload } from "~/lib/uploads.server";
import { Consent, ErrorNote, SubmitButton, TextInput, Title } from "~/components/ui";
import { OwnerPage, ownerMeta } from "~/components/owner";

export const meta = ownerMeta("공실 등록");

export async function loader({ request, context }: Route.LoaderArgs) {
  const owner = await requireOwner(request, context.cloudflare.env);
  if (!ownerProfileComplete(owner)) throw redirect("/owner/welcome");
  return null;
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const owner = await requireOwner(request, env);
  if (!ownerProfileComplete(owner)) throw redirect("/owner/welcome");
  const form = await request.formData();

  const parsed = parseOwnerSpaceForm(form);
  if (!parsed.ok) return data({ error: parsed.error }, { status: 400 });
  // Validate every photo before storing any, so a rejected form never leaves orphan files.
  const photos = checkPhotos(form.getAll("photos"));
  if (!photos.ok) return data({ error: photos.error }, { status: 400 });

  const photoKeys: string[] = [];
  for (const file of photos.value) photoKeys.push(await storeUpload(env.UPLOADS, "owner-photos", file));
  await createOwnerSpace(env.DB, owner.id, { ...parsed.value, photoKeys });
  return redirect("/owner/spaces?registered=1");
}

const STEPS = [
  "운영자가 확인하고 공개해요 (보통 1~2일)",
  "가게 앞에 붙일 QR을 받아요",
  "주민 50명이 모이면 원하는 업종이 나와요",
  "창업자를 모집하고 AI가 평가해요",
  "상위 후보를 보고, 계약은 공인중개사와 진행해요",
];

export default function OwnerSpaceNew({ actionData }: Route.ComponentProps) {
  return (
    <OwnerPage wide>
      <Title eyebrow="공실 등록">어떤 공간인가요?</Title>
      <div className="split">
        <Form method="post" encType="multipart/form-data">
          <TextInput label="공간 이름" name="name" placeholder="예: 성수동 골목 1층 공실" maxLength={60} required />
          <div className="grid grid-cols-2 gap-3.5">
            <TextInput label="구" name="district" placeholder="예: 성동구" maxLength={20} required />
            <TextInput label="동" name="dong" placeholder="예: 성수동" maxLength={40} required />
          </div>
          <label className="mb-5 block">
            <span className="mb-1.5 block text-base font-medium">위치 특징</span>
            <textarea
              name="locationNotes"
              maxLength={500}
              placeholder="예: 성수역 3번 출구 도보 4분, 카페 골목 초입"
              className="min-h-28 w-full rounded-[10px] border border-line bg-paper px-3.5 py-2.5 text-base focus:border-ink focus:outline-none"
            />
            <span className="mt-1 block text-[15px] text-muted">AI 평가에 쓰여요. 임대료·보증금 같은 계약 조건은 적지 않아요.</span>
          </label>
          <label className="mb-5 block">
            <span className="mb-1.5 block text-base font-medium">사진 (선택)</span>
            <input
              type="file"
              name="photos"
              multiple
              accept="image/*"
              className="block w-full rounded-[10px] border border-dashed border-line p-3.5 text-base"
            />
            {/* 5 = MAX_PHOTOS (uploads.server is server-only, so the UI cannot import it). */}
            <span className="mt-1 block text-[15px] text-muted">최대 5장 · PNG, JPG, WEBP · 운영자만 볼 수 있어요.</span>
          </label>
          {/* TODO(legal): how much ownership verification is enough (registry check, power of attorney)? For now this check plus operator review. */}
          <Consent
            name="ownerConfirm"
            label="이 공간의 소유자(또는 위임받은 사람)예요"
            detail="등록하면 쓸모가 가게 앞 QR 설문을 진행하는 데 동의하는 것으로 봐요."
            required
          />
          <div className="mt-4">
            <ErrorNote message={actionData?.error} />
            <SubmitButton>등록하기</SubmitButton>
          </div>
        </Form>
        <aside className="rounded-2xl border border-line bg-soft p-5 lg:p-6">
          <h2 className="text-xl font-bold">등록하면 이렇게 진행돼요</h2>
          <ol className="mt-3 list-decimal pl-5 text-base leading-[1.8]">
            {STEPS.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </aside>
      </div>
    </OwnerPage>
  );
}
