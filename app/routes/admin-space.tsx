import { Form, Link } from "react-router";
import type { Route } from "./+types/admin-space";
import { requireAdmin } from "~/lib/auth.server";
import { getSpace, setOwnerConsent } from "~/lib/spaces.server";
import { Section, Shell, Title } from "~/components/ui";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const space = await getSpace(env.DB, Number(params.id));
  if (!space) throw new Response("Not found", { status: 404 });
  return { space, origin: new URL(request.url).origin };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const form = await request.formData();
  if (form.get("intent") === "set-consent") {
    await setOwnerConsent(env.DB, Number(params.id), form.get("consent") === "1");
  }
  return null;
}

export default function AdminSpace({ loaderData }: Route.ComponentProps) {
  const { space, origin } = loaderData;
  const consented = space.owner_consent === 1;
  return (
    <Shell wide>
      <Title eyebrow={space.neighborhood}>{space.name}</Title>
      <Section title="건물주 동의">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p>
            {consented ? "동의 완료 — 링크가 공개돼 있어요." : "동의 전 — 설문·리포트·신청 링크가 모두 비공개예요."}
            {space.consent_file_key && (
              <>
                {" "}
                <a className="underline" href={`/admin/files/${space.consent_file_key}`}>
                  동의서 파일
                </a>
              </>
            )}
          </p>
          <Form method="post">
            <input type="hidden" name="intent" value="set-consent" />
            <input type="hidden" name="consent" value={consented ? "0" : "1"} />
            <button className="rounded-lg border border-ink px-3 py-1.5">
              {consented ? "동의 취소(비공개로)" : "동의 받음(공개하기)"}
            </button>
          </Form>
        </div>
      </Section>
      <Section title="링크">
        <ul className="space-y-1 text-sm break-all">
          <li>설문: {origin}/s/{space.slug}</li>
          <li>공개 요약: {origin}/r/{space.slug}</li>
          <li>창업 신청: {origin}/apply/{space.slug}</li>
        </ul>
      </Section>
      <Link to="/admin" className="text-sm text-muted underline">
        ← 목록으로
      </Link>
    </Shell>
  );
}
