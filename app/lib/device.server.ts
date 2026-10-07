import { createCookie } from "react-router";

// Best-effort "one response per device": clearing cookies bypasses it, which
// is acceptable for the prototype.
const deviceCookie = createCookie("ssulmo_device", {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 60 * 24 * 400,
});

export async function getDeviceId(request: Request): Promise<{ id: string; setCookie: string | null }> {
  const existing = await deviceCookie.parse(request.headers.get("Cookie"));
  if (typeof existing === "string" && existing) return { id: existing, setCookie: null };
  const id = crypto.randomUUID();
  return { id, setCookie: await deviceCookie.serialize(id) };
}
