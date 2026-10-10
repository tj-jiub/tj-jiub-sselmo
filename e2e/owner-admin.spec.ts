import { expect, test, type Page } from "@playwright/test";

// Cross-role flow (spec §7). Link requests: new owner x1, seed owner x1. Reusable against the same DB.
test.describe.configure({ mode: "serial" });

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

async function ownerLogin(page: Page, email: string) {
  await page.goto("/owner");
  await page.getByLabel("이메일").fill(email);
  await page.getByRole("button", { name: "로그인 링크 받기" }).click();
  await page.goto((await page.getByTestId("dev-login-link").getAttribute("href"))!);
}

async function adminLogin(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("이메일").fill("admin@ssulmo.local");
  await page.getByLabel("비밀번호").fill("ssulmo-dev");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page.getByRole("heading", { name: /승인 대기 공실/ })).toBeVisible();
}

test("owner registers a space → not public → admin approves → public page opens and owner sees the stage", async ({ browser }) => {
  const owner = await (await browser.newContext({ baseURL: test.info().project.use.baseURL, ...test.info().project.use })).newPage();
  const admin = await (await browser.newContext({ baseURL: test.info().project.use.baseURL, ...test.info().project.use })).newPage();

  await ownerLogin(owner, `e2e-x-${Date.now()}@example.com`);
  await owner.locator('input[name="name"]').fill("e2e·승인 흐름");
  await owner.locator('input[name="phone"]').fill("010-7777-0000");
  await owner.getByLabel(/이용약관/).check();
  await owner.getByLabel(/개인정보 수집/).check();
  await owner.getByRole("button", { name: "시작하기" }).click();
  // Let the welcome form's redirect land first; otherwise it can override the next goto.
  await expect(owner).toHaveURL(/\/owner\/spaces$/);
  await owner.goto("/owner/spaces/new");
  const name = `e2e·승인 ${Date.now()}`;
  await owner.locator('input[name="name"]').fill(name);
  await owner.locator('input[name="district"]').fill("성동구");
  await owner.locator('input[name="dong"]').fill("행당동");
  await owner.locator('input[name="photos"]').setInputFiles([{ name: "a.png", mimeType: "image/png", buffer: PNG }]);
  await owner.getByLabel(/소유자/).check();
  await owner.getByRole("button", { name: "등록하기" }).click();
  await expect(owner.getByText("운영자 확인 대기")).toBeVisible();

  await adminLogin(admin);
  const row = admin.locator("li, tr, div", { has: admin.getByText(name) }).filter({ has: admin.getByRole("button", { name: "승인" }) }).last();
  await expect(row).toContainText("e2e·승인 흐름");
  // The admin cover URL (/admin/files/..., served as an attachment) must still render in an <img>.
  await expect.poll(() => row.locator("img").first().evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  // Wait for the approve POST to finish before reading the owner's view; otherwise the owner page can
  // load while the space is still pending.
  await Promise.all([
    admin.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/admin")),
    row.getByRole("button", { name: "승인" }).click(),
  ]);

  await owner.goto("/owner/spaces");
  const card = owner.locator("article, li, div", { has: owner.getByText(name) }).last();
  await expect(card).toContainText("주민 의견 모으는 중");
  const slug = (await owner.getByRole("link", { name: /동네 의견/ }).first().getAttribute("href"))!;
  expect((await owner.goto(slug))?.status()).toBe(200);
});

test("owner memo is visible to the admin; the home page has no admin link", async ({ browser, page }) => {
  const ownerPage = await (await browser.newContext({ baseURL: test.info().project.use.baseURL, ...test.info().project.use })).newPage();
  const admin = await (await browser.newContext({ baseURL: test.info().project.use.baseURL, ...test.info().project.use })).newPage();
  await ownerLogin(ownerPage, "owner@ssulmo.local");
  await ownerPage.getByRole("link", { name: "후보 보기" }).first().click();
  const memoText = `관리자에게 보이는 메모 ${Date.now()}`;
  // Second card: owner.spec asserts the seeded memo on the first card and edits the last one, in a
  // parallel worker; touching either would race with it.
  const card = ownerPage.getByTestId("candidate-card").nth(1);
  const memo = card.getByTestId("memo");
  const original = await memo.inputValue();
  await memo.fill(memoText);
  await card.getByRole("button", { name: "저장" }).click();
  await expect(card.getByTestId("memo-status")).toContainText("저장했어요");

  await adminLogin(admin);
  await admin.goto("/admin/spaces");
  await admin.getByRole("link", { name: /성수동 골목 1층 공실/ }).click();
  await expect(admin.getByText(memoText)).toBeVisible();

  await memo.fill(original);
  await card.getByRole("button", { name: "저장" }).click();
  await expect(card.getByTestId("memo-status")).toContainText("저장했어요");

  await page.goto("/");
  await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
});
