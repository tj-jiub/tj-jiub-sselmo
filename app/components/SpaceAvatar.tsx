import { avatarInitial } from "~/lib/cover";

const SIZE = { 40: "size-10 rounded-[10px] text-base", 56: "size-14 rounded-[14px] text-[22px]", 88: "size-[88px] rounded-[20px] text-[34px]" } as const;

/**
 * Rounded-square space avatar. `src` is the already-gated URL for this viewer (public cover route,
 * owner cover route or admin file); null shows the initial of the 동 on --soft.
 */
export function SpaceAvatar({
  src,
  name,
  neighborhood,
  size = 56,
}: {
  src: string | null;
  name: string;
  neighborhood?: string | null;
  size?: 40 | 56 | 88;
}) {
  const box = `grid shrink-0 place-items-center overflow-hidden border border-line bg-soft font-bold ${SIZE[size]}`;
  if (src) {
    return (
      <span className={box}>
        <img src={src} alt="공실 대표 사진" loading="lazy" className="size-full object-cover" />
      </span>
    );
  }
  return (
    <span className={box} aria-hidden="true">
      {avatarInitial(name, neighborhood)}
    </span>
  );
}
