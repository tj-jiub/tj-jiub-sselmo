import { expect, test } from "@playwright/test";

test("public pages expose no admin entry point", async ({ page }) => {
  for (const path of ["/", "/find"]) {
    await page.goto(path);
    await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("관리자");
  }
});

test("home links to the owner entry", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "건물주이신가요? 공실 등록하기" })).toHaveAttribute("href", "/owner");
});

test("admin login is noindex (header and meta) but still reachable", async ({ page }) => {
  const res = await page.goto("/admin/login");
  expect(res?.status()).toBe(200);
  expect(res?.headers()["x-robots-tag"]).toContain("noindex");
  await expect(page.locator('meta[name="robots"][content="noindex"]')).toHaveCount(1);
});

test("public pages are not marked noindex", async ({ request }) => {
  const res = await request.get("/find");
  expect(res.headers()["x-robots-tag"]).toBeUndefined();
});

test("unauthenticated /admin redirects to login", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test("admin sees the pending-space queue with the seeded owner space", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("이메일").fill("admin@ssulmo.local");
  await page.getByLabel("비밀번호").fill("ssulmo-dev");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page.getByRole("heading", { name: /승인 대기 공실/ })).toBeVisible();
  const item = page.getByRole("listitem").filter({ hasText: "금호동 역세권 1층" }).filter({ hasText: "이건물" });
  await expect(item).toBeVisible();
  await expect(item.getByText("owner@ssulmo.local")).toBeVisible();
  await expect(item.getByRole("button", { name: "승인" })).toBeVisible();
  await expect(item.getByRole("button", { name: "반려" })).toBeVisible();
});
