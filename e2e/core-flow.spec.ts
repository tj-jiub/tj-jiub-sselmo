import { expect, test } from "@playwright/test";

async function answerSurvey(page: import("@playwright/test").Page) {
  await page.goto("/s/mangwon-01");
  await page.getByText("아이스크림·디저트", { exact: true }).click();
  await page.getByText("주 1~2회", { exact: true }).click();
  await page.getByText("5천~1만원", { exact: true }).click();
  await page.getByText("오후", { exact: true }).click();
  await page.getByText("주민", { exact: true }).click();
  await page.getByRole("button", { name: "제출하기" }).click();
}

test("unknown space is a 404", async ({ page }) => {
  const res = await page.goto("/s/does-not-exist");
  expect(res?.status()).toBe(404);
});

test("survey → cooldown → public summary", async ({ page }) => {
  await answerSurvey(page);
  await expect(page.getByText("응답이 저장됐어요. 고마워요!")).toBeVisible();
  await answerSurvey(page);
  await expect(page.getByText("이미 응답하셨어요.")).toBeVisible();

  await page.goto("/r/mangwon-01");
  await expect(page.getByText(/응답자 \d+명 중 \d+명이 이용 의향/).first()).toBeVisible();
});

test("application → admin sees it after login", async ({ page }) => {
  const name = `테스트${Date.now() % 100000}`;
  await page.goto("/apply/mangwon-01");
  await page.getByLabel("하고 싶은 업종").fill("젤라또 가게");
  await page.getByLabel("사업계획", { exact: true }).fill("동네 주민 대상 소형 젤라또 가게");
  await page.getByLabel("예상 창업 비용 (만원)").fill("4000");
  await page.getByLabel("이름", { exact: true }).fill(name);
  await page.getByLabel("이메일 (결과 링크를 받을 주소)").fill("e2e@example.com");
  await page.locator('input[name="consentPrivacy"]').check();
  await page.locator('input[name="consentIntroTerms"]').check();
  await page.locator('input[name="consentAi"]').check();
  // 쓸모 트랙 is the default; its consulting consent is required.
  await page.locator('input[name="track"][value="ssulmo"]').check();
  await page.locator('input[name="consentConsulting"]').check();
  await page.getByRole("button", { name: "무료로 신청하기" }).click();
  await expect(page.getByText("신청이 접수됐어요")).toBeVisible();

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.getByLabel("이메일").fill("admin@ssulmo.local");
  await page.getByLabel("비밀번호").fill("ssulmo-dev");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page.getByText(`${name} · 젤라또 가게`)).toBeVisible();
});

// Depends on the seed giving applicant 이예시 (token "b" x32) an AI report.
test("result page shows the free AI report and no payment UI", async ({ page }) => {
  expect((await page.goto(`/result/${"0".repeat(32)}`))?.status()).toBe(404);

  await page.goto(`/result/${"b".repeat(32)}`);
  await expect(page.getByText("보완하면 좋아요", { exact: true })).toBeVisible();
  await expect(page.getByText("오픈 베타 기간 무료")).toBeVisible();
  await expect(page.getByText("입금")).toHaveCount(0);
});

test("founder matching: by item and by district", async ({ page }) => {
  // Yes → 먹거리 → 베이커리 → ranked card with the fixed phrase.
  await page.goto("/find");
  await page.getByRole("link", { name: /네, 정했어요/ }).click();
  await page.getByRole("heading", { name: "어떤 가게를 하려고 하나요?" }).waitFor();
  const food = page.locator("section", { has: page.getByRole("heading", { name: "먹거리" }) });
  await food.getByRole("link", { name: "베이커리", exact: true }).click();
  await expect(page.getByText(/응답자 \d+명 중 \d+명이 이용 의향/).first()).toBeVisible();
  // The apply link carries the type and the form opens prefilled.
  await page.getByRole("link", { name: "이 업종으로 지원해보기" }).first().click();
  await expect(page.getByLabel("하고 싶은 업종")).toHaveValue("베이커리");

  // No → 성동구 → each space's #1 type (the non-consented space never shows).
  await page.goto("/find");
  await page.getByRole("link", { name: /아직이에요/ }).click();
  await page.getByRole("link", { name: /성동구/ }).click();
  await expect(page.getByText("1위 아이스크림·디저트")).toBeVisible();
  await expect(page.getByText("연희동 비공개 공실")).toHaveCount(0);
});

// ---- AI screening flows (run with EVALUATOR=fake, the .dev.vars default) ----

async function applyOnSsulmoTrack(page: import("@playwright/test").Page, name: string) {
  await page.goto("/apply/seongsu-01");
  await page.getByLabel("하고 싶은 업종").fill("아이스크림·디저트");
  await page.getByLabel("사업계획", { exact: true }).fill("동네 주민 대상 소형 젤라또 가게. 오후와 저녁 테이크아웃 중심.");
  await page.getByLabel("예상 창업 비용 (만원)").fill("4000");
  await page.getByLabel("이름", { exact: true }).fill(name);
  await page.getByLabel("이메일 (결과 링크를 받을 주소)").fill("e2e-ai@example.com");
  await page.locator('input[name="track"][value="ssulmo"]').check();
  await page.locator('input[name="consentPrivacy"]').check();
  await page.locator('input[name="consentIntroTerms"]').check();
  await page.locator('input[name="consentAi"]').check();
  await page.locator('input[name="consentConsulting"]').check();
  await page.getByRole("button", { name: "무료로 신청하기" }).click();
  await expect(page.getByText("신청이 접수됐어요")).toBeVisible();
}

async function adminOpenApplication(page: import("@playwright/test").Page, name: string) {
  await page.goto("/admin/login");
  await page.getByLabel("이메일").fill("admin@ssulmo.local");
  await page.getByLabel("비밀번호").fill("ssulmo-dev");
  await page.getByRole("button", { name: "로그인" }).click();
  await page.getByRole("link", { name: new RegExp(`${name} · 아이스크림`) }).click();
}

test("쓸모 track application → AI evaluation → result page shows verdict and report", async ({ page }) => {
  const name = `AI${Date.now() % 100000}`;
  await applyOnSsulmoTrack(page, name);
  await adminOpenApplication(page, name);
  const link = await page.locator("span", { hasText: /\/result\// }).first().innerText();
  await page.goto(link);
  // Evaluation runs after the response (waitUntil): reload until it is done.
  await expect(async () => {
    await page.reload();
    await expect(page.getByText("오픈 베타 기간 무료")).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 30_000 });
  await expect(page.getByText(`${name}님, 평가가 나왔어요`)).toBeVisible();
  await expect(page.getByText("수요 적합도")).toBeVisible();
  await expect(page.getByText("AI가 작성한 평가")).toBeVisible();
  await expect(page.getByText("입금")).toHaveCount(0);
});

test("owner link shows at most 5 candidate cards and no applicant name or email", async ({ page }) => {
  expect((await page.goto(`/o/${"0".repeat(32)}`))?.status()).toBe(404);
  await page.goto(`/o/${"p".repeat(32)}`);
  const cards = await page.locator(".cp-row").count();
  expect(cards).toBeGreaterThanOrEqual(1);
  expect(cards).toBeLessThanOrEqual(5);
  const html = await page.content();
  for (const secret of ["예시", "@example.com", "사업계획 예시", "result/"]) expect(html).not.toContain(secret);
  await expect(page.getByText("쓸모는 계약에 참여하지 않고")).toBeVisible();
});

test("admin records consulting months: 1% fee in a profit month, 0 in a loss month", async ({ page }) => {
  const name = `FEE${Date.now() % 100000}`;
  await applyOnSsulmoTrack(page, name);
  await adminOpenApplication(page, name);

  const add = async (month: string, revenue: string, profit: string) => {
    await page.locator('input[name="month"]').fill(month);
    await page.locator('input[name="revenueManwon"]').fill(revenue);
    await page.locator('input[name="profitManwon"]').fill(profit);
    await page.getByRole("button", { name: "기록 추가" }).click();
  };
  await add("2030-01", "1000", "180");
  const profitRow = page.getByRole("row", { name: /2030-01/ });
  await expect(profitRow).toContainText("10만원");
  await add("2030-02", "620", "-40");
  const lossRow = page.getByRole("row", { name: /2030-02/ });
  await expect(lossRow).toContainText("0원");
});
