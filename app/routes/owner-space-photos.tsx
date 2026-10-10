import { data, Form, Link, redirect } from "react-router";
import type { Route } from "./+types/owner-space-photos";
import { requireOwner } from "~/lib/owner-auth.server";
import { getOwnedSpace, ownerPhotoState } from "~/lib/owner-spaces.server";
import { applyPhotosForm } from "~/lib/cover.server";
import { btnGhost, ErrorNote, SubmitButton, Title } from "~/components/ui";
import { OwnerPage, ownerMeta } from "~/components/owner";

export const meta = ownerMeta("사진 바꾸기");

const notFound = () => new Response("Not found", { status: 404 });
const parseId = (raw: string | undefined) => (raw && /^\d+$/.test(raw) ? Number(raw) : null);
// Mirrors MAX_PHOTOS (uploads.server is server-only, so the component cannot import it).
const MAX = 5;

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const owner = await requireOwner(request, env);
  const id = parseId(params.id);
  if (id === null) throw notFound();
  const space = await getOwnedSpace(env.DB, owner.id, id);
  if (!space || (space.status !== "pending" && space.status !== "active")) throw notFound();
  // Owners work on their own view: the waiting proposal if there is one.
  const { keys, cover, staged } = ownerPhotoState(space);
  return {
    id,
    name: space.name,
    neighborhood: space.neighborhood,
    // The owner's own random keys (no PII); thumbnails load through the owner-isolated route by position.
    photos: keys.map((k, i) => ({ index: i, isCover: k === cover, key: k })),
    room: Math.max(0, MAX - keys.length),
    // Changes on a public space wait for the operator; the public page keeps the old photos until then.
    reviewNotice: space.status === "active",
    staged,
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const owner = await requireOwner(request, env);
  const id = parseId(params.id);
  if (id === null) throw notFound();
  const result = await applyPhotosForm(env, owner.id, id, await request.formData());
  if (!result.ok) {
    if (result.status === 404) throw notFound();
    return data({ error: result.error }, { status: 400 });
  }
  return redirect(`/owner/spaces/${id}/photos?saved=1`);
}

export default function OwnerSpacePhotos({ loaderData, actionData }: Route.ComponentProps) {
  const { id, photos, room, reviewNotice, staged } = loaderData;
  return (
    <OwnerPage>
      <Title eyebrow={loaderData.neighborhood} sub="대표 사진은 공실 목록과 공개 페이지의 작은 사진으로 쓰여요.">
        사진 바꾸기
      </Title>
      {reviewNotice && (
        <p data-testid="photo-review-notice" className="mb-6 rounded-[10px] border border-line bg-soft px-4 py-3 text-[15px]">
          {staged
            ? "바꾼 사진은 운영자 확인 중이에요. 확인되기 전까지 공개 페이지에는 예전 사진이 보여요."
            : "공개 중인 공실이라 사진을 바꾸면 운영자가 확인한 뒤에 공개돼요."}
        </p>
      )}
      {photos.length > 0 ? (
        <Form method="post" className="mb-10">
          <input type="hidden" name="intent" value="cover" />
          <fieldset>
            <legend className="mb-2 text-base font-medium">대표 사진 고르기</legend>
            <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              {photos.map((p) => (
                <li key={p.key} className="rounded-xl border border-line p-2">
                  <img
                    src={`/owner/spaces/${id}/cover?i=${p.index}`}
                    alt={`공실 사진 ${p.index + 1}`}
                    className="aspect-[4/3] w-full rounded-lg object-cover"
                    loading="lazy"
                  />
                  <div className="mt-2">
                    <label className="flex items-center gap-2 text-base">
                      <input type="radio" name="cover" value={p.key} defaultChecked={p.isCover} className="size-5" />
                      {p.isCover ? "지금 대표 사진" : "대표로 쓰기"}
                    </label>
                  </div>
                </li>
              ))}
            </ul>
          </fieldset>
          <div className="mt-4">
            <SubmitButton>대표 사진 저장</SubmitButton>
          </div>
        </Form>
      ) : (
        <p className="mb-8 text-base text-muted">아직 올린 사진이 없어요. 아래에서 올려 보세요.</p>
      )}
      <Form method="post" encType="multipart/form-data">
        <input type="hidden" name="intent" value="add" />
        <label className="mb-5 block">
          <span className="mb-1.5 block text-base font-medium">사진 더 올리기</span>
          <input
            type="file"
            name="photos"
            multiple
            accept="image/*"
            disabled={room === 0}
            className="block w-full rounded-[10px] border border-dashed border-line p-3.5 text-base"
          />
          <span className="mt-1 block text-[15px] text-muted">
            {room > 0 ? `${room}장 더 올릴 수 있어요. (최대 ${MAX}장 · PNG, JPG, WEBP)` : `사진이 ${MAX}장이라 더 올릴 수 없어요.`}
          </span>
        </label>
        <ErrorNote message={actionData?.error} />
        <SubmitButton>사진 올리기</SubmitButton>
      </Form>
      <p className="mt-6">
        <Link to="/owner/spaces" className={btnGhost}>
          내 공실로 돌아가기
        </Link>
      </p>
    </OwnerPage>
  );
}
