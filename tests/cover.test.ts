import { describe, expect, it } from "vitest";
import { avatarInitial, publicCoverUrl, resolveCoverKey } from "../app/lib/cover.ts";

describe("avatarInitial", () => {
  it("uses the first Korean character of the 동", () => {
    expect(avatarInitial("성수동 골목 1층", "성동구 성수동")).toBe("성");
    expect(avatarInitial("행당동 1층", "성동구 행당동")).toBe("행");
  });
  it("falls back to the name, then to ?", () => {
    expect(avatarInitial("왕십리 코너", null)).toBe("왕");
    expect(avatarInitial("Corner 1", "Seoul")).toBe("C");
    expect(avatarInitial("  ", "")).toBe("?");
  });
});

describe("resolveCoverKey", () => {
  it("defaults to the first photo", () => {
    expect(resolveCoverKey(["a", "b"], null)).toBe("a");
  });
  it("keeps a stored cover that is one of the photos", () => {
    expect(resolveCoverKey(["a", "b"], "b")).toBe("b");
  });
  it("ignores a cover that is not among the photos", () => {
    expect(resolveCoverKey(["a"], "zzz")).toBe("a");
    expect(resolveCoverKey([], "zzz")).toBeNull();
  });
});

it("builds the public cover url", () => {
  expect(publicCoverUrl("seongsu-01")).toBe("/media/space/seongsu-01/cover");
});
