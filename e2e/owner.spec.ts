import { expect, test, type Page } from "@playwright/test";
import { dbRows } from "./db";

// Needs EVALUATOR=fake and DEV_SHOW_LOGIN_LINK=1 in .dev.vars and a freshly migrated + seeded DB.
// Link requests per run: random unknown email x1, owner@ssulmo.local x1, owner A x1, owner B x1
// (limits: 3 per email / 10 min, 20 per IP / hour; globalSetup clears the table at suite start).
test.describe.configure({ mode: "serial" });

const SEED_EMAIL = "owner@ssulmo.local";
const SEED_SPACE = "성수동 골목 1층 공실";
const uniqueEmail = (tag: string) => `e2e-${tag}-${Date.now()}@example.com`;
// 1x1 transparent PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

async function requestLink(page: Page, email: string) {
  await page.goto("/owner");
  await page.getByLabel("이메일").fill(email);
  await page.getByRole("button", { name: "로그인 링크 받기" }).click();
  await expect(page.getByTestId("login-sent")).toBeVisible();
  const href = await page.getByTestId("dev-login-link").getAttribute("href");
  expect(href).toContain("/owner/verify?token=");
  return { href: href!, sentText: (await page.getByTestId("login-sent").innerText()).trim() };
}

async function signUp(page: Page, tag: string, profile = true) {
  const email = uniqueEmail(tag);
  const { href } = await requestLink(page, email);
  await page.goto(href);
  await expect(page).toHaveURL(/\/owner\/welcome$/);
  if (profile) {
    await page.locator('input[name="name"]').fill("e2e·테스트 건물주");
    await page.locator('input[name="phone"]').fill("010-5555-0000");
    await page.getByLabel(/이용약관/).check();
    await page.getByLabel(/개인정보 수집/).check();
    await page.getByRole("button", { name: "시작하기" }).click();
    await expect(page).toHaveURL(/\/owner\/spaces$/);
  }
  return { email, href };
}

const hydrated = (page: Page) => page.waitForFunction(() => document.documentElement.dataset.ownerReady === "1");

let seedLink = "";
let seedSpaceId = "";

test("B1: neutral message is identical for unknown and known emails; dev link is shown", async ({ page }) => {
  const unknown = await requestLink(page, uniqueEmail("unknown"));
  const known = await requestLink(page, SEED_EMAIL);
  expect(unknown.sentText).toBe(known.sentText);
  expect(unknown.sentText).toContain("메일을 보냈다면");
  seedLink = known.href;
  await expect(page.getByRole("link", { name: /관리자/ })).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
});

test("new owner: sign up, register a space, stays private, link is single-use", async ({ page }) => {
  const { href } = await signUp(page, "a");
  await expect(page.getByRole("heading", { name: /내 공실/ })).toContainText("0곳");

  await page.getByRole("link", { name: /공실 등록/ }).click();
  await expect(page).toHaveURL(/\/owner\/spaces\/new$/);
  const name = `e2e·공간 ${Date.now()}`;
  await page.locator('input[name="name"]').fill(name);
  await page.locator('input[name="district"]').fill("성동구");
  await page.locator('input[name="dong"]').fill("성수동");
  await page.locator('textarea[name="locationNotes"]').fill("성수역 근처 카페 골목");
  await page.locator('input[name="photos"]').setInputFiles([{ name: "front.png", mimeType: "image/png", buffer: PNG }]);
  await page.getByLabel(/소유자/).check();
  await page.getByRole("button", { name: "등록하기" }).click();

  await expect(page).toHaveURL(/\/owner\/spaces\?registered=1$/);
  await expect(page.getByTestId("registered-notice")).toContainText("운영자가 확인");
  const card = page.getByTestId("space-card").filter({ hasText: name });
  await expect(card.getByTestId("space-stage")).toHaveText("운영자 확인 대기");
  await expect(card.getByRole("link", { name: "후보 보기" })).toHaveCount(0);
  await expect(card.getByRole("link", { name: "동네 의견" })).toHaveCount(0);
  await expect(card.getByText("QR 받기")).toHaveCount(0);

  // Pending spaces can be renamed.
  await card.getByRole("link", { name: "수정" }).click();
  const renamed = `${name} (수정)`;
  await page.locator('input[name="name"]').fill(renamed);
  await page.getByRole("button", { name: "저장하기" }).click();
  await expect(page.getByTestId("space-card").filter({ hasText: renamed })).toHaveCount(1);

  // Not public anywhere.
  for (const path of ["/find", "/spaces"]) {
    await page.goto(path);
    expect(await page.content()).not.toContain(renamed);
  }

  // The login link works exactly once, and the failure page never leaks the token.
  const res = await page.goto(href);
  expect(res?.status()).toBe(400);
  await expect(page.getByText("이 링크는 쓸 수 없어요")).toBeVisible();
  expect(res?.headers()["referrer-policy"]).toBe("no-referrer");
  expect(res?.headers()["cache-control"]).toContain("no-store");
});

test("owner changes the cover photo; it is served privately while pending", async ({ page, request }) => {
  await signUp(page, "cover");
  await page.getByRole("link", { name: /공실 등록/ }).click();
  const name = `e2e·사진 ${Date.now()}`;
  await page.locator('input[name="name"]').fill(name);
  await page.locator('input[name="district"]').fill("성동구");
  await page.locator('input[name="dong"]').fill("행당동");
  await page.locator('input[name="photos"]').setInputFiles([
    { name: "a.png", mimeType: "image/png", buffer: PNG },
    { name: "b.png", mimeType: "image/png", buffer: PNG },
  ]);
  await page.getByLabel(/소유자/).check();
  await page.getByRole("button", { name: "등록하기" }).click();
  await expect(page).toHaveURL(/\/owner\/spaces\?registered=1$/);
  const card = page.getByTestId("space-card").filter({ hasText: name });
  await expect(card.locator("img[alt='공실 대표 사진']")).toBeVisible();

  const rowFor = () => dbRows<{ id: number; slug: string; cover_key: string; photo_keys: string }>(`SELECT id, slug, cover_key, photo_keys FROM spaces WHERE name = '${name}'`)[0];
  const before = rowFor();
  const keys = JSON.parse(before.photo_keys) as string[];
  expect(before.cover_key).toBe(keys[0]);

  await card.getByRole("link", { name: "사진 바꾸기" }).click();
  await expect(page).toHaveURL(/\/owner\/spaces\/\d+\/photos$/);
  await page.locator(`input[name="cover"][value="${keys[1]}"]`).check();
  await Promise.all([page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/photos")), page.getByRole("button", { name: "대표 사진 저장" }).click()]);
  await expect.poll(() => rowFor().cover_key).toBe(keys[1]);

  // Pending: the public cover route does not exist for anonymous visitors.
  const res = await request.get(`/media/space/${before.slug}/cover`);
  expect(res.status()).toBe(404);
});

test("seed owner: stages, candidates, star + memo persist, privacy", async ({ page }) => {
  await page.goto(seedLink);
  await expect(page).toHaveURL(/\/owner\/spaces$/);
  await expect(page.getByText("이건물 님")).toBeVisible();

  const done = page.getByTestId("space-card").filter({ hasText: SEED_SPACE });
  await expect(done.getByTestId("space-stage")).toHaveText("후보 평가 완료");
  await expect(done).toContainText("명의 후보");
  await expect(done.getByRole("link", { name: "동네 의견" })).toHaveAttribute("href", "/r/seongsu-01");
  await expect(done.getByText("QR 받기")).toBeVisible();
  await expect(done.getByRole("link", { name: "수정" })).toHaveCount(0);
  const pending = page.getByTestId("space-card").filter({ hasText: "금호동 역세권 1층" });
  await expect(pending.getByTestId("space-stage")).toHaveText("운영자 확인 대기");
  await expect(pending.getByRole("link", { name: "수정" })).toBeVisible();

  const href = (await done.getByRole("link", { name: "후보 보기" }).getAttribute("href"))!;
  expect(href).toMatch(/^\/owner\/spaces\/\d+\/candidates$/);
  seedSpaceId = href.split("/")[3];
  await done.getByRole("link", { name: "후보 보기" }).click();

  const cards = page.getByTestId("candidate-card");
  await hydrated(page);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("AI 평가 상위 후보");
  await expect(page.getByText("메모는 운영자와 공유돼요")).toBeVisible();
  await expect(page.getByText(/응답자 \d+명 중 \d+명이 이용 의향/)).toBeVisible();
  const n = await cards.count();
  expect(n).toBeGreaterThanOrEqual(1);
  expect(n).toBeLessThanOrEqual(5);
  await expect(page.locator("mark")).toHaveCount(1);
  // seeded star + memo
  await expect(page.getByTestId("memo").filter({ hasText: "인테리어를 직접 한다고 함" })).toHaveCount(1);

  // privacy: raw server HTML (includes the serialized loader data) has no applicant data
  const html = await (await page.request.get(href)).text();
  for (const bad of ["예시", "@example.com", "result/", "plan", "owner_token", "consent_file_key", "photo_keys"]) {
    expect(html, `html must not contain ${bad}`).not.toContain(bad);
  }

  // no horizontal overflow on phone and desktop widths
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `overflow at ${width}px`).toBeLessThanOrEqual(0);
  }

  // Toggle a star on the last card and flip it back at the end (re-runnable).
  const last = cards.last();
  const star = last.getByTestId("star");
  const before = (await star.getAttribute("aria-pressed")) === "true";
  await star.click();
  await expect(star).toHaveAttribute("aria-pressed", String(!before));
  await page.waitForLoadState("networkidle");
  await page.reload();
  await hydrated(page);
  await expect(cards.last().getByTestId("star")).toHaveAttribute("aria-pressed", String(!before));

  // filter chip: 관심 shows only starred cards, count matches the chip
  const starredNow = await page.locator('[data-testid="star"][aria-pressed="true"]').count();
  await expect(page.getByTestId("chip-starred")).toHaveText(`관심 ${starredNow}`);
  await page.getByTestId("chip-starred").click();
  await expect(page.locator('[data-testid="candidate-card"]:visible')).toHaveCount(starredNow);
  await page.getByTestId("chip-all").click();
  await expect(page.locator('[data-testid="candidate-card"]:visible')).toHaveCount(n);

  // memo: autosave (debounce), then explicit save button; both persist
  const memo = cards.last().getByTestId("memo");
  const original = await memo.inputValue();
  const text = `e2e 메모 ${Date.now()}`;
  await memo.fill(text);
  await expect(cards.last().getByTestId("memo-status")).toHaveText("저장했어요", { timeout: 10_000 });
  await page.reload();
  await hydrated(page);
  await expect(cards.last().getByTestId("memo")).toHaveValue(text);
  await cards.last().getByTestId("memo").fill(original);
  await cards.last().getByRole("button", { name: "저장" }).click();
  await expect(cards.last().getByTestId("memo-status")).toHaveText("저장했어요", { timeout: 10_000 });
  await page.reload();
  await hydrated(page);
  await expect(cards.last().getByTestId("memo")).toHaveValue(original);

  // restore the star
  const star2 = cards.last().getByTestId("star");
  await star2.click();
  await expect(star2).toHaveAttribute("aria-pressed", String(before));
  await page.waitForLoadState("networkidle");
  await page.reload();
  await hydrated(page);
  await expect(cards.last().getByTestId("star")).toHaveAttribute("aria-pressed", String(before));
});

test("isolation: another owner gets 404; logged-out visitors go to /owner; logout works", async ({ page }) => {
  expect(seedSpaceId).toMatch(/^\d+$/);

  // logged out
  await page.goto("/owner/spaces");
  await expect(page).toHaveURL(/\/owner$/);
  await page.goto(`/owner/spaces/${seedSpaceId}/candidates`);
  await expect(page).toHaveURL(/\/owner$/);

  // owner B, signed in through the raw verify redirect (also checks its headers)
  const email = uniqueEmail("b");
  const { href } = await requestLink(page, email);
  const redirectRes = await page.request.get(href, { maxRedirects: 0 });
  expect(redirectRes.status()).toBe(302);
  expect(redirectRes.headers()["referrer-policy"]).toBe("no-referrer");
  expect(redirectRes.headers()["cache-control"]).toContain("no-store");
  expect(redirectRes.headers()["location"]).toContain("/owner/welcome");

  for (const path of [
    `/owner/spaces/${seedSpaceId}/candidates`,
    `/owner/spaces/${seedSpaceId}/edit`,
    "/owner/spaces/99999999/candidates",
    "/owner/spaces/abc/candidates",
    "/owner/spaces/1e3/candidates",
  ]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(404);
  }
  // writing a mark on someone else's candidate is refused too
  const post = await page.request.post(`/owner/spaces/${seedSpaceId}/candidates`, { form: { applicationId: "1", starred: "1" } });
  expect(post.status()).toBe(404);

  // logout
  await page.goto("/owner/spaces");
  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page).toHaveURL(/\/owner$/);
  await page.goto("/owner/spaces");
  await expect(page).toHaveURL(/\/owner$/);

  // GET /owner/logout just redirects
  await page.goto("/owner/logout");
  await expect(page).toHaveURL(/\/owner$/);
});
