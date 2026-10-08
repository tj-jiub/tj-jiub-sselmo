import { describe, expect, it } from "vitest";
import { PUBLIC_THRESHOLD } from "~/lib/report";
import {
  ANY_DISTRICT,
  MATCH_THRESHOLD,
  headlineWord,
  listDistricts,
  objectParticle,
  pageLayout,
  parseFindParams,
  recommendByDistrict,
  recommendByType,
  tallySpace,
  type SpaceTally,
} from "~/lib/matching";

const answers = (...rows: string[][]) => rows.map((businessTypes) => ({ businessTypes }));
const repeat = <T,>(n: number, v: T) => Array.from({ length: n }, () => v);

function space(slug: string, district: string | null, rows: string[][], name = slug): SpaceTally {
  return tallySpace({ slug, name, neighborhood: `${district ?? ""} 동`, district }, answers(...rows));
}

describe("tallySpace", () => {
  it("counts respondents per type and totals responses", () => {
    const s = space("a", "성동구", [["카페", "베이커리"], ["카페"], ["분식"]]);
    expect(s.total).toBe(3);
    expect(s.counts).toEqual({ 카페: 2, 베이커리: 1, 분식: 1 });
  });
  it("counts a type once per respondent even if duplicated", () => {
    expect(space("a", "성동구", [["카페", "카페"]]).counts).toEqual({ 카페: 1 });
  });
  it("mirrors the report threshold", () => {
    expect(MATCH_THRESHOLD).toBe(PUBLIC_THRESHOLD);
    expect(MATCH_THRESHOLD).toBe(50);
  });
});

describe("recommendByType", () => {
  const big = (slug: string, m: number, total = 60, name = slug) =>
    space(slug, "성동구", [...repeat(m, ["베이커리"]), ...repeat(total - m, ["분식"])], name);

  it("ranks ready spaces by M desc with the fixed phrase", () => {
    const r = recommendByType([big("low", 10), big("high", 40), big("mid", 20)], "베이커리");
    expect(r.ranked.map((x) => x.slug)).toEqual(["high", "mid", "low"]);
    expect(r.ranked.map((x) => x.rank)).toEqual([1, 2, 3]);
    expect(r.ranked[0].phrase).toBe("응답자 60명 중 40명이 이용 의향");
    expect(r.ranked[0].count).toBe(40);
    expect(r.ranked[0].total).toBe(60);
  });
  it("breaks ties by more responses, then by name", () => {
    const r = recommendByType([big("b", 10, 60, "나"), big("a", 10, 80, "다"), big("c", 10, 60, "가")], "베이커리");
    expect(r.ranked.map((x) => x.slug)).toEqual(["a", "c", "b"]);
  });
  it("excludes spaces where M is 0", () => {
    const r = recommendByType([big("none", 0), big("some", 3)], "베이커리");
    expect(r.ranked.map((x) => x.slug)).toEqual(["some"]);
    expect(r.pending).toEqual([]);
  });
  it("groups spaces under the threshold as pending without any numbers", () => {
    const small = space("small", "용산구", [...repeat(8, ["베이커리"]), ...repeat(12, ["카페"])]);
    const r = recommendByType([big("big", 5), small], "베이커리");
    expect(r.ranked.map((x) => x.slug)).toEqual(["big"]);
    expect(r.pending).toHaveLength(1);
    expect(r.pending[0]).toEqual({ slug: "small", name: "small", neighborhood: "용산구 동", district: "용산구" });
    expect(JSON.stringify(r.pending)).not.toMatch(/\d{2}/);
  });
  it("treats exactly 50 responses as ready and 49 as pending", () => {
    const at50 = space("at50", "성동구", repeat(50, ["카페"]));
    const at49 = space("at49", "성동구", repeat(49, ["카페"]));
    const r = recommendByType([at50, at49], "카페");
    expect(r.ranked.map((x) => x.slug)).toEqual(["at50"]);
    expect(r.pending.map((x) => x.slug)).toEqual(["at49"]);
  });
  it("returns empty groups when nobody wants the type", () => {
    expect(recommendByType([big("x", 0)], "꽃집")).toEqual({ ranked: [], pending: [] });
  });
});

describe("listDistricts", () => {
  it("lists only districts that have spaces, with counts, by count then name", () => {
    const list = listDistricts([
      space("a", "성동구", [["카페"]]),
      space("b", "성동구", [["카페"]]),
      space("c", "마포구", [["카페"]]),
      space("d", "강서구", [["카페"]]),
      space("e", null, [["카페"]]),
    ]);
    expect(list).toEqual([
      { district: "성동구", count: 2 },
      { district: "강서구", count: 1 },
      { district: "마포구", count: 1 },
    ]);
  });
  it("is empty without spaces", () => {
    expect(listDistricts([])).toEqual([]);
  });
});

describe("recommendByDistrict", () => {
  const ice = space("ice", "성동구", [...repeat(100, ["아이스크림·디저트", "카페"]), ...repeat(20, ["베이커리"])], "아이스");
  const banchan = space("banchan", "성동구", [...repeat(31, ["반찬가게", "세탁소"]), ...repeat(42, ["분식"])], "반찬");
  const pending = space("p", "성동구", repeat(20, ["꽃집"]));
  const other = space("o", "마포구", repeat(60, ["카페"]));

  it("returns each ready space's #1 type with the phrase and runners-up", () => {
    const r = recommendByDistrict([banchan, ice, other, pending], "성동구");
    expect(r.ranked.map((x) => x.slug)).toEqual(["ice", "banchan"]);
    expect(r.ranked[0].top).toEqual({ type: "아이스크림·디저트", count: 100 });
    expect(r.ranked[0].phrase).toBe("응답자 120명 중 100명이 이용 의향");
    expect(r.ranked[0].runners).toEqual([
      { type: "카페", count: 100 },
      { type: "베이커리", count: 20 },
    ]);
    expect(r.ranked[1].top).toEqual({ type: "분식", count: 42 });
    expect(r.ranked[1].runners).toEqual([
      { type: "반찬가게", count: 31 },
      { type: "세탁소", count: 31 },
    ]);
    expect(r.pending.map((x) => x.slug)).toEqual(["p"]);
  });
  it("keeps ties in a space stable by type name", () => {
    expect(recommendByDistrict([ice], "성동구").ranked[0].top.type).toBe("아이스크림·디저트");
  });
  it("shows every district for ANY_DISTRICT", () => {
    const r = recommendByDistrict([ice, other], ANY_DISTRICT);
    expect(r.ranked.map((x) => x.slug)).toEqual(["ice", "o"]);
  });
  it("leaves out ready spaces with no answers at all", () => {
    const empty = space("e", "성동구", repeat(50, []));
    expect(recommendByDistrict([empty], "성동구").ranked).toEqual([]);
  });
  it("is empty for an unknown district", () => {
    expect(recommendByDistrict([ice], "없는구")).toEqual({ ranked: [], pending: [] });
  });
});

describe("pageLayout", () => {
  it("shows 1 card on mobile and 3 on PC before expanding", () => {
    const l = pageLayout(5, false);
    expect(l.itemClass(0)).toBe("");
    expect(l.itemClass(1)).toBe("hidden md:block");
    expect(l.itemClass(2)).toBe("hidden md:block");
    expect(l.itemClass(3)).toBe("hidden");
    expect(l.moreClass).toBe("");
  });
  it("shows everything once expanded and hides the button", () => {
    const l = pageLayout(5, true);
    expect([0, 1, 2, 3, 4].map(l.itemClass)).toEqual(["", "", "", "", ""]);
    expect(l.moreClass).toBeNull();
  });
  it("offers 더 보기 only on mobile when 2-3 cards exist", () => {
    expect(pageLayout(3, false).moreClass).toBe("md:hidden");
    expect(pageLayout(2, false).moreClass).toBe("md:hidden");
  });
  it("needs no button for a single card", () => {
    expect(pageLayout(1, false).moreClass).toBeNull();
    expect(pageLayout(0, false).moreClass).toBeNull();
  });
});

describe("parseFindParams", () => {
  const p = (s: string) => new URLSearchParams(s);
  it("starts at step 1 without params", () => {
    expect(parseFindParams(p(""))).toEqual({ step: "start" });
  });
  it("item=yes asks for a type, with a valid type shows results", () => {
    expect(parseFindParams(p("item=yes"))).toEqual({ step: "pick-type" });
    expect(parseFindParams(p("item=yes&type=베이커리"))).toEqual({ step: "type-results", type: "베이커리" });
  });
  it("ignores unknown types", () => {
    expect(parseFindParams(p("item=yes&type=우주선"))).toEqual({ step: "pick-type" });
  });
  it("item=no asks for a district; district=any means no preference", () => {
    expect(parseFindParams(p("item=no"))).toEqual({ step: "pick-district" });
    expect(parseFindParams(p("item=no&district=성동구"))).toEqual({ step: "district-results", district: "성동구" });
    expect(parseFindParams(p("item=no&district=any"))).toEqual({ step: "district-results", district: ANY_DISTRICT });
  });
  it("rejects over-long district values", () => {
    expect(parseFindParams(p(`item=no&district=${"가".repeat(30)}`))).toEqual({ step: "pick-district" });
  });
  it("falls back to start for garbage", () => {
    expect(parseFindParams(p("item=maybe"))).toEqual({ step: "start" });
  });
});

describe("headline helpers", () => {
  it("shortens combined types to the first word", () => {
    expect(headlineWord("아이스크림·디저트")).toBe("아이스크림");
    expect(headlineWord("카페")).toBe("카페");
  });
  it("picks the object particle by final consonant", () => {
    expect(objectParticle("카페")).toBe("를");
    expect(objectParticle("베이커리")).toBe("를");
    expect(objectParticle("분식")).toBe("을");
    expect(objectParticle("아이스크림")).toBe("을");
  });
});
