import { describe, expect, it } from "vitest";
import { hashPassword, isAdmin, login, requireAdmin, verifyPassword } from "~/lib/auth.server";

const env = {
  ADMIN_EMAIL: "admin@ssulmo.local",
  ADMIN_PASSWORD_HASH: "",
  SESSION_SECRET: "test-secret",
};

describe("auth", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const stored = await hashPassword("correct horse");
    expect(stored).toMatch(/^pbkdf2:100000:[0-9a-f]{32}:[0-9a-f]{64}$/);
    expect(await verifyPassword("correct horse", stored)).toBe(true);
    expect(await verifyPassword("wrong", stored)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });

  it("logs in with matching credentials and the cookie grants admin", async () => {
    const e = { ...env, ADMIN_PASSWORD_HASH: await hashPassword("pw") };
    const req = new Request("http://localhost/admin/login", { method: "POST" });
    expect(await login(req, e, "someone@else.com", "pw")).toBeNull();
    expect(await login(req, e, "admin@ssulmo.local", "nope")).toBeNull();

    const res = await login(req, e, " Admin@Ssulmo.local ", "pw");
    expect(res?.status).toBe(302);
    const cookie = res!.headers.get("Set-Cookie")!.split(";")[0];
    const authed = new Request("http://localhost/admin", { headers: { Cookie: cookie } });
    expect(await isAdmin(authed, e)).toBe(true);
  });

  it("redirects anonymous requests to the login page", async () => {
    const anon = new Request("http://localhost/admin/files/x", { method: "POST" });
    const thrown = await requireAdmin(anon, env).catch((r: Response) => r);
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).headers.get("Location")).toBe("/admin/login");
  });
});
