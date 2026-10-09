// Result mail via Resend. Only the link goes out; evaluation content never does (spec §7).
export type MailBody = { subject: string; text: string };
export interface Mailer {
  send(to: string, body: MailBody): Promise<void>;
}
type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export function resultMailBody(link: string): MailBody {
  return { subject: "쓸모 평가 결과가 나왔어요", text: `안녕하세요, 쓸모예요.\n평가 결과가 나왔어요. 아래 링크에서 확인해 주세요.\n${link}` };
}

export async function sendWithResend(
  m: { apiKey: string; from: string; to: string } & MailBody,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const res = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${m.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from: m.from, to: [m.to], subject: m.subject, text: m.text }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}`);
}

export type MailEnv = { RESEND_API_KEY?: string; MAIL_FROM?: string };
/** null = mail is not configured: the admin copies the link and ticks "보냄" by hand. */
export function mailerFromEnv(env: MailEnv, fetchImpl: FetchLike = fetch): Mailer | null {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) return null;
  const { RESEND_API_KEY: apiKey, MAIL_FROM: from } = env;
  return { send: (to, body) => sendWithResend({ apiKey, from, to, ...body }, fetchImpl) };
}
