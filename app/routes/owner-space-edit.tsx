import { data, Form, redirect } from "react-router";
import type { Route } from "./+types/owner-space-edit";
import { requireOwner } from "~/lib/owner-auth.server";
import { getOwnedSpace, parseOwnerSpaceEdit, updatePendingSpace } from "~/lib/owner-spaces.server";
import { ErrorNote, SubmitButton, TextInput, Title } from "~/components/ui";
import { OwnerPage, ownerMeta } from "~/components/owner";

export const meta = ownerMeta("공실 수정");

const notFound = () => new Response("Not found", { status: 404 });
const parseId = (raw: string | undefined) => (raw && /^\d+$/.test(raw) ? Number(raw) : null);

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const owner = await requireOwner(request, env);
  const id = parseId(params.id);
  if (id === null) throw notFound();
  const space = await getOwnedSpace(env.DB, owner.id, id);
  // Only a pending space can be edited: after the operator has looked at it, it is fixed.
  if (!space || space.status !== "pending") throw notFound();
  return { name: space.name, neighborhood: space.neighborhood, locationNotes: space.location_notes ?? "" };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const owner = await requireOwner(request, env);
  const id = parseId(params.id);
  if (id === null) throw notFound();
  const parsed = parseOwnerSpaceEdit(await request.formData());
  if (!parsed.ok) return data({ error: parsed.error }, { status: 400 });
  if (!(await updatePendingSpace(env.DB, owner.id, id, parsed.value))) throw notFound();
  return redirect("/owner/spaces");
}

export default function OwnerSpaceEdit({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <OwnerPage>
      <Title eyebrow={loaderData.neighborhood} sub="운영자 확인 전에는 이름과 위치 특징을 고칠 수 있어요.">
        공실 수정
      </Title>
      <Form method="post">
        <TextInput label="공간 이름" name="name" defaultValue={loaderData.name} maxLength={60} required />
        <label className="mb-6 block">
          <span className="mb-1.5 block text-base font-medium">위치 특징</span>
          <textarea
            name="locationNotes"
            maxLength={500}
            defaultValue={loaderData.locationNotes}
            className="min-h-28 w-full rounded-[10px] border border-line bg-paper px-3.5 py-2.5 text-base focus:border-ink focus:outline-none"
          />
        </label>
        <ErrorNote message={actionData?.error} />
        <SubmitButton>저장하기</SubmitButton>
      </Form>
    </OwnerPage>
  );
}
