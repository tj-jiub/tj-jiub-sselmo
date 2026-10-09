import { describe, expect, it } from "vitest";
import { mailerFromEnv, resultMailBody, sendWithResend } from "~/lib/mail.server";

describe("mailerFromEnv", () => {
  it("is null unless both RESEND_API_KEY and MAIL_FROM are set", () => {
    expect(mailerFromEnv({})).toBeNull();
    expect(mailerFromEnv({ RESEND_API_KEY: "k" })).toBeNull();
    expect(mailerFromEnv({ MAIL_FROM: "a@b.kr" })).toBeNull();
    expect(mailerFromEnv({ RESEND_API_KEY: "", MAIL_FROM: "a@b.kr" })).toBeNull();
    expect(mailerFromEnv({ RESEND_API_KEY: "k", MAIL_FROM: "a@b.kr" })).not.toBeNull();
  });
});

describe("result mail", () => {
  it("contains only the link and a greeting", () => {
    const body = resultMailBody("https://x.kr/result/abc");
    expect(body.text).toContain("https://x.kr/result/abc");
    expect(body.subject).toBe("쓸모 평가 결과가 나왔어요");
    expect(body.text.length).toBeLessThan(200);
  });
  it("posts to Resend", async () => {
    let seen: any;
    const mailer = await import("~/lib/mail.server").then((m) =>
      m.mailerFromEnv({ RESEND_API_KEY: "rk", MAIL_FROM: "쓸모 <a@b.kr>" }, async (url, init) => {
        seen = { url: String(url), init };
        return new Response("{}", { status: 200 });
      })!,
    );
    await mailer.send("to@x.kr", resultMailBody("https://x.kr/r"));
    expect(seen.url).toBe("https://api.resend.com/emails");
    expect((seen.init.headers as Record<string, string>).Authorization).toBe("Bearer rk");
    expect(JSON.parse(seen.init.body)).toMatchObject({ from: "쓸모 <a@b.kr>", to: ["to@x.kr"] });
    await expect(
      sendWithResend({ apiKey: "k", from: "f", to: "t", subject: "s", text: "x" }, async () => new Response("bad", { status: 422 })),
    ).rejects.toThrow(/422/);
  });
});
