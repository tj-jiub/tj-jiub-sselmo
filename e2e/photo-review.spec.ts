import { expect, test, type Page } from "@playwright/test";

// Photo changes on an already-public space wait for the operator (user decision 2026-10-10).
// Uses the seed owner's active space and always ends by rejecting, which restores the seed state.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const SPACE = "성수동 골목 1층 공실";

async function ownerLogin(page: Page) {
  await page.goto("/owner");
  await page.getByLabel("이메일").fill("owner@ssulmo.local");
  await page.getByRole("button", { name: "로그인 링크 받기" }).click();
  await page.goto((await page.getByTestId("dev-login-link").getAttribute("href"))!);
  await expect(page).toHaveURL(/\/owner\/spaces$/);
}

async function adminLogin(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("이메일").fill("admin@ssulmo.local");
  await page.getByLabel("비밀번호").fill("ssulmo-dev");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("a photo added to a public space waits for the operator; rejecting drops it", async ({ browser }) => {
  const ctx = () => browser.newContext({ baseURL: test.info().project.use.baseURL, ...test.info().project.use });
  const owner = await (await ctx()).newPage();
  const admin = await (await ctx()).newPage();

  await ownerLogin(owner);
  const card = owner.getByTestId("space-card").filter({ hasText: SPACE });
  await card.getByRole("link", { name: "사진 바꾸기" }).click();
  await expect(owner).toHaveURL(/\/owner\/spaces\/\d+\/photos$/);
  await expect(owner.getByTestId("photo-review-notice")).toContainText("운영자가 확인한 뒤에 공개돼요");

  await owner.locator('input[name="photos"]').setInputFiles([{ name: "new-front.png", mimeType: "image/png", buffer: PNG }]);
  await Promise.all([
    owner.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/photos")),
    owner.getByRole("button", { name: "사진 올리기" }).click(),
  ]);
  await owner.reload();
  await expect(owner.getByTestId("photo-review-notice")).toContainText("운영자 확인 중");

  // The public cover does not show the new photo: the seed space had no published photo.
  const slug = "seongsu-01";
  expect((await admin.request.get(`/media/space/${slug}/cover`)).status()).toBe(404);

  await adminLogin(admin);
  const review = admin.getByTestId("photo-review").filter({ hasText: SPACE });
  await expect(review).toContainText("새 사진 1장");
  await Promise.all([
    admin.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/admin")),
    review.getByRole("button", { name: "반려" }).click(),
  ]);
  await expect(admin.getByTestId("photo-review").filter({ hasText: SPACE })).toHaveCount(0);

  await owner.reload();
  await expect(owner.getByTestId("photo-review-notice")).toContainText("운영자가 확인한 뒤에 공개돼요");
  expect((await admin.request.get(`/media/space/${slug}/cover`)).status()).toBe(404);
});
