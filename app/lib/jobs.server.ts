// Glue between a request and the evaluation: picks the evaluator/mailer from env and
// runs in ctx.waitUntil so the applicant does not wait.
import { r2PdfLoader, runEvaluation } from "./evaluation.server";
import { pickEvaluator } from "./evaluator.server";
import { mailerFromEnv } from "./mail.server";

export function scheduleEvaluation(
  context: { cloudflare: { env: Env; ctx: ExecutionContext } },
  applicationId: number,
  origin: string,
): void {
  const { env, ctx } = context.cloudflare;
  ctx.waitUntil(
    runEvaluation(env.DB, applicationId, {
      evaluator: pickEvaluator(env),
      mailer: mailerFromEnv(env),
      origin,
      pdf: r2PdfLoader(env.UPLOADS),
    }),
  );
}
