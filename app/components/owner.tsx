import { useEffect, type ReactNode } from "react";
import { Form, Link } from "react-router";
import { Shell, Wordmark } from "~/components/ui";

/** Every owner page is a tool page: never indexed. */
export const ownerMeta = (title: string) => () => [{ title: `${title} — 쓸모` }, { name: "robots", content: "noindex" }];

/** Wordmark + 내 공실 + 로그아웃. No admin link, ever. */
export function OwnerNav() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-[1180px] items-center justify-between px-4 py-2.5 lg:px-12 lg:py-3.5">
        <Wordmark />
        <nav className="flex items-center gap-2 text-[15px] lg:gap-4">
          <Link to="/owner/spaces" className="inline-flex min-h-11 items-center px-2 font-medium hover:underline">
            내 공실
          </Link>
          <Form method="post" action="/owner/logout">
            <button type="submit" className="inline-flex min-h-11 items-center px-2 text-muted hover:text-ink">
              로그아웃
            </button>
          </Form>
        </nav>
      </div>
    </header>
  );
}

/** Logged-in owner pages. `wide` opens the 1180px column on PC. */
export function OwnerPage({ wide = false, children }: { wide?: boolean; children: ReactNode }) {
  // Hydration marker for e2e: clicks on client-only controls (star, chips) are lost before this runs.
  useEffect(() => {
    document.documentElement.dataset.ownerReady = "1";
  }, []);
  return (
    <>
      <OwnerNav />
      <Shell nav={false} wide={wide}>
        {children}
      </Shell>
    </>
  );
}

/** Soft notice box (no highlight colour: the headline owns the one highlight). */
export function Notice({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <p data-testid={testId} className="mb-6 rounded-[10px] border border-line bg-soft px-4 py-3 text-base">
      {children}
    </p>
  );
}
