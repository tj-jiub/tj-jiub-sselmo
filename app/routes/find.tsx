import type { Route } from "./+types/find";
import { loadPublicTallies } from "~/lib/matching.server";
import { listDistricts, parseFindParams, recommendByDistrict, recommendByType } from "~/lib/matching";
import { DistrictResults, DistrictStep, StartStep, TypeResults, TypeStep } from "~/components/matching";

export const meta: Route.MetaFunction = () => [{ title: "공실 찾기 — 쓸모" }];

// The whole flow lives in the URL (?item=yes&type=… / ?item=no&district=…) so
// every step is linkable and the loader stays a pure function of the query.
export async function loader({ request, context }: Route.LoaderArgs) {
  const state = parseFindParams(new URL(request.url).searchParams);
  switch (state.step) {
    case "start":
      return { step: "start" as const };
    case "pick-type":
      return { step: "pick-type" as const };
    case "type-results": {
      const tallies = await loadPublicTallies(context.cloudflare.env.DB);
      return { step: "type-results" as const, type: state.type, ...recommendByType(tallies, state.type) };
    }
    case "pick-district": {
      const tallies = await loadPublicTallies(context.cloudflare.env.DB);
      return { step: "pick-district" as const, districts: listDistricts(tallies) };
    }
    case "district-results": {
      const tallies = await loadPublicTallies(context.cloudflare.env.DB);
      return { step: "district-results" as const, district: state.district, ...recommendByDistrict(tallies, state.district) };
    }
  }
}

export default function Find({ loaderData: d }: Route.ComponentProps) {
  return (
    <>
      {d.step === "start" && <StartStep />}
      {d.step === "pick-type" && <TypeStep />}
      {d.step === "pick-district" && <DistrictStep districts={d.districts} />}
      {d.step === "type-results" && <TypeResults type={d.type} ranked={d.ranked} pending={d.pending} />}
      {d.step === "district-results" && <DistrictResults district={d.district} ranked={d.ranked} pending={d.pending} />}
    </>
  );
}
