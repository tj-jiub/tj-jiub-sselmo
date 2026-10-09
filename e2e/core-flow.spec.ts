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
  await expect(page.getByText("보완하면 좋아요")).toBeVisible();
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
