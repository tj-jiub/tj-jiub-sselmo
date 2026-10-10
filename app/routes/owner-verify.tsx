import { data, Link } from "react-router";
import type { Route } from "./+types/owner-verify";
import { consumeLoginToken, ownerProfileComplete, startOwnerSession, upsertOwner } from "~/lib/owner-auth.server";
import { btnPrimary, Shell, Title } from "~/components/ui";
import { ownerMeta } from "~/components/owner";

export const meta = ownerMeta("로그인");

// The token sits in the URL: never leak it through Referer and never cache the response.
const PRIVATE_HEADERS = { "Referrer-Policy": "no-referrer", "Cache-Control": "no-store" } as const;

export function headers() {
  return PRIVATE_HEADERS;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const email = await consumeLoginToken(env.DB, token);
  if (!email) return data({ invalid: true }, { status: 400, headers: PRIVATE_HEADERS });
  const owner = await upsertOwner(env.DB, email);
  const res = await startOwnerSession(request, env, owner.id, ownerProfileComplete(owner) ? "/owner/spaces" : "/owner/welcome");
  for (const [k, v] of Object.entries(PRIVATE_HEADERS)) res.headers.set(k, v);
  return res;
}

export default function OwnerVerify() {
  return (
    <Shell nav="minimal">
      <Title eyebrow="로그인">이 링크는 쓸 수 없어요</Title>
      <p className="mb-8 text-base">링크는 15분 동안, 한 번만 쓸 수 있어요. 이미 썼거나 시간이 지났을 수 있어요.</p>
      <Link to="/owner" className={`${btnPrimary} w-full lg:w-auto`}>
        새 로그인 링크 받기
      </Link>
    </Shell>
  );
}
