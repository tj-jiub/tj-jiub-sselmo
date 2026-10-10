import { expect, test, type Page } from "@playwright/test";
import { dbRows, kstMonthNow } from "./db";

async function adminLogin(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("이메일").fill("admin@ssulmo.local");
  await page.getByLabel("비밀번호").fill("ssulmo-dev");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByTestId("todo-pendingSpaces")).toBeVisible();
}

const CARDS = ["pendingSpaces", "unmailed", "aiFailed", "revenueMissing"] as const;

function expectedCounts() {
  const [row] = dbRows<Record<(typeof CARDS)[number], number>>(
    `SELECT
      (SELECT COUNT(*) FROM spaces WHERE status = 'pending'
         OR (status = 'active' AND (pending_photo_keys IS NOT NULL OR pending_cover_key IS NOT NULL))) AS pendingSpaces,
      (SELECT COUNT(*) FROM applications WHERE ai_status = 'done' AND result_mailed_at IS NULL) AS unmailed,
      (SELECT COUNT(*) FROM applications WHERE ai_status = 'failed') AS aiFailed,
      (SELECT COUNT(*) FROM applications a WHERE a.track = 'ssulmo' AND a.consent_consulting_at IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM consulting_months m WHERE m.application_id = a.id AND m.month = '${kstMonthNow()}')) AS revenueMissing`,
  );
  return row;
}

async function shownCounts(page: Page) {
  await page.goto("/admin");
  const out: Record<string, number> = {};
  for (const key of CARDS) {
    const text = (await page.getByTestId(`todo-${key}`).locator(".sr").textContent()) ?? "";
    out[key] = Number(text.replace(/[^\d]/g, ""));
  }
  return out;
}

test("A1 shows the four counts from the database; the side menu has the four items", async ({ page }) => {
  // The poll below can use its full 30s while parallel specs churn the counts; leave room for the rest.
  test.setTimeout(90_000);
  await adminLogin(page);
  // Other specs may create rows while this one runs: retry until UI and database agree.
  await expect.poll(async () => JSON.stringify(await shownCounts(page)) === JSON.stringify(expectedCounts()), { timeout: 30_000 }).toBe(true);
  const counts = expectedCounts();
  expect(counts.pendingSpaces).toBeGreaterThanOrEqual(1); // the seeded owner space
  expect(counts.unmailed).toBeGreaterThanOrEqual(1);
  const menu = page.getByRole("navigation", { name: "관리자 메뉴" });
  for (const label of ["할 일", "공실", "신청", "건물주"]) await expect(menu.getByRole("link", { name: new RegExp(`^${label}`) })).toBeVisible();
  await expect(menu.getByRole("link", { name: /^할 일/ })).toHaveAttribute("aria-current", "page");
  // Cards with work get the yellow treatment.
  await expect(page.getByTestId("todo-pendingSpaces")).toHaveAttribute("data-hot", "1");
});

test("clicking a card opens the filtered list", async ({ page }) => {
  await adminLogin(page);
  await page.getByTestId("todo-pendingSpaces").click();
  await expect(page).toHaveURL(/\/admin\/spaces\?status=pending$/);
  const rows = page.getByTestId("space-row");
  await expect(rows.first()).toBeVisible();
  for (const text of await rows.allInnerTexts()) expect(text).toContain("승인 대기");
  await expect(page.getByRole("link", { name: /^공실/ })).toHaveAttribute("aria-current", "page");

  await page.goto("/admin");
  await page.getByTestId("todo-unmailed").click();
  await expect(page).toHaveURL(/\/admin\/applications\?status=mail$/);
  const apps = page.getByTestId("application-row");
  await expect(apps.first()).toBeVisible();
  for (const text of await apps.allInnerTexts()) expect(text).toContain("메일 보낼 차례");

  await page.goto("/admin");
  await page.getByTestId("todo-revenueMissing").click();
  await expect(page).toHaveURL(/\/admin\/applications\?status=revenue$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("창업 신청");
});

test("space list: search by name and stage chips", async ({ page }) => {
  await adminLogin(page);
  await page.goto("/admin/spaces");
  await expect(page.getByTestId("space-row").first()).toBeVisible();
  await page.getByLabel("공실 검색").fill("망원");
  await page.getByRole("button", { name: "검색" }).click();
  await expect(page).toHaveURL(/q=/);
  const rows = page.getByTestId("space-row");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("망원동 1층 코너 공실");
  await expect(rows.first()).toContainText("운영자 등록");
  await expect(rows.first().getByRole("link", { name: "QR · 상세" })).toBeVisible();
});

test("A3: application detail shows the progress line and the next-action box", async ({ page }) => {
  await adminLogin(page);
  await page.goto("/admin/applications?status=mail");
  const row = page.getByTestId("application-row").first();
  await expect(row).toBeVisible();
  await row.getByRole("link", { name: "결과 메일 보내기" }).click();
  await expect(page).toHaveURL(/\/admin\/applications\/\d+$/);
  const box = page.getByTestId("next-action");
  await expect(box).toContainText("다음 할 일: 결과 메일 보내기");
  await expect(box.getByRole("button", { name: "링크 복사" })).toBeVisible();
  await expect(box.getByRole("button", { name: "보냈어요" })).toBeVisible();
  await expect(page.locator('[data-step="now"]')).toHaveText("결과 메일");
  await expect(page.locator('[data-step="done"]').first()).toHaveText("신청");
});

test("public cover route 404s for a pending space and an unknown slug", async ({ request }) => {
  const [pending] = dbRows<{ slug: string }>("SELECT slug FROM spaces WHERE status = 'pending' ORDER BY id LIMIT 1");
  expect(pending?.slug).toBeTruthy();
  expect((await request.get(`/media/space/${pending.slug}/cover`)).status()).toBe(404);
  expect((await request.get("/media/space/does-not-exist/cover")).status()).toBe(404);
});

test("admin owners list shows the seeded owner with PII", async ({ page }) => {
  await adminLogin(page);
  await page.getByRole("link", { name: /^건물주/ }).click();
  const table = page.getByTestId("owner-table");
  const row = table.getByRole("row", { name: /owner@ssulmo\.local/ });
  await expect(row).toContainText("이건물");
  await expect(row).toContainText("010-1234-5678");
});

test.describe("ticker with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test("R1 shows the final digits at once and the value once for screen readers", async ({ page }) => {
    await page.goto("/r/seongsu-01");
    const tk = page.locator(".tk").first();
    await expect(tk).toBeVisible();
    await expect(tk.locator(".sr-only, .sr").first()).toHaveText(/120/);
    const dir = await tk.locator("[aria-hidden='true']").first().getAttribute("aria-hidden");
    expect(dir).toBe("true");
  });
});
