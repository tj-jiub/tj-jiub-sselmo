import { Link } from "react-router";
import type { Route } from "./+types/owner-spaces";
import { listOwnerSpaces } from "~/lib/owner-spaces.server";
import { requireOwner } from "~/lib/owner-auth.server";
import { stageView } from "~/lib/owner-stage";
import { Card, btnSmall, btnSmallGhost, Hl, Title } from "~/components/ui";
import { Notice, OwnerPage, ownerMeta } from "~/components/owner";
import { QrDownload } from "~/components/QrDownload";
import { NumberTicker, ProgressBar } from "~/components/NumberTicker";
import { SpaceAvatar } from "~/components/SpaceAvatar";
import { ownerCoverUrl } from "~/lib/cover";
import { PUBLIC_THRESHOLD } from "~/lib/report";

export const meta = ownerMeta("내 공실");

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const owner = await requireOwner(request, env);
  const url = new URL(request.url);
  const cards = await listOwnerSpaces(env.DB, owner.id);
  return {
    ownerName: owner.name ?? "",
    origin: url.origin,
    registered: url.searchParams.get("registered") === "1",
    // Explicit fields only. The slug leaves the server only while the space is public.
    spaces: cards.map((c) => ({
      id: c.id,
      name: c.name,
      neighborhood: c.neighborhood,
      stage: c.stage,
      responseCount: c.responseCount,
      candidateCount: c.candidateCount,
      rejectReason: c.rejectReason,
      hasCover: c.hasCover,
      slug: c.stage === "collecting" || c.stage === "evaluated" ? c.slug : null,
    })),
  };
}

export default function OwnerSpaces({ loaderData }: Route.ComponentProps) {
  const { ownerName, origin, registered, spaces } = loaderData;
  return (
    <OwnerPage wide>
      <Title eyebrow={`${ownerName} 님`}>
        내 공실 <Hl>{spaces.length}곳</Hl>
      </Title>
      {registered && (
        <Notice testId="registered-notice">공실을 등록했어요. 운영자가 확인한 뒤 공개해요. 보통 1~2일 걸려요.</Notice>
      )}
      <ul className="grid gap-4 lg:grid-cols-3 lg:gap-5">
        {spaces.map((s) => {
          const v = stageView(s);
          return (
            <li key={s.id}>
              <Card top={s.stage === "evaluated"} className="h-full">
                <div data-testid="space-card" className="flex h-full flex-col">
                  <div className="flex items-center gap-3.5">
                    <SpaceAvatar src={s.hasCover ? ownerCoverUrl(s.id) : null} name={s.name} neighborhood={s.neighborhood} size={88} />
                    <div className="min-w-0">
                      <p data-testid="space-stage" className="text-[15px] font-medium text-muted">
                        {v.label}
                      </p>
                      <h2 className="mt-1 text-xl font-bold">{s.name}</h2>
                      <p className="text-[15px] text-muted">{s.neighborhood}</p>
                    </div>
                  </div>
                  {v.big && (
                    <div className="mt-3.5 text-ink">
                      {s.stage === "collecting" && s.responseCount < PUBLIC_THRESHOLD ? (
                        <>
                          <NumberTicker value={s.responseCount} unit={`/ ${PUBLIC_THRESHOLD}명`} className="text-[40px] font-medium" />
                          <ProgressBar value={s.responseCount} max={PUBLIC_THRESHOLD} label="주민 의견 모집 진행" className="mt-2.5" />
                        </>
                      ) : (
                        <NumberTicker value={Number(v.big.value)} unit={v.big.unit} className="text-[40px] font-medium" />
                      )}
                    </div>
                  )}
                  {v.note && <p className="mt-2 text-[15px] text-muted">{v.note}</p>}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {v.canViewCandidates && (
                      <Link to={`/owner/spaces/${s.id}/candidates`} className={btnSmall}>
                        후보 보기
                      </Link>
                    )}
                    {v.isLive && s.slug && (
                      <Link to={`/r/${s.slug}`} className={btnSmallGhost}>
                        동네 의견
                      </Link>
                    )}
                    {(s.stage === "pending" || s.stage === "collecting" || s.stage === "evaluated") && (
                      <Link to={`/owner/spaces/${s.id}/photos`} className={btnSmallGhost}>
                        사진 바꾸기
                      </Link>
                    )}
                    {v.canEdit && (
                      <Link to={`/owner/spaces/${s.id}/edit`} className={btnSmallGhost}>
                        수정
                      </Link>
                    )}
                  </div>
                  {v.isLive && s.slug && (
                    <div className="mt-4 border-t border-line pt-4">
                      <p className="mb-2 text-[15px] font-medium">QR 받기</p>
                      <QrDownload url={`${origin}/s/${s.slug}`} filename={`ssulmo-${s.slug}.png`} />
                    </div>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
        <li>
          <Link
            to="/owner/spaces/new"
            className="grid h-full min-h-44 place-items-center rounded-[14px] border border-dashed border-line p-6 text-center text-base text-muted hover:border-ink"
          >
            <span>
              <b className="block text-xl text-ink">+ 공실 등록</b>
              주소와 위치 특징만 있으면 돼요
            </span>
          </Link>
        </li>
      </ul>
    </OwnerPage>
  );
}
