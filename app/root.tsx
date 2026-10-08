import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap",
  },
];

export const meta: Route.MetaFunction = () => [{ title: "썰모" }];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="antialiased">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="min-h-dvh font-sans">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-h3 font-bold">{notFound ? "페이지를 찾을 수 없어요" : "문제가 생겼어요"}</h1>
      <p className="mt-3 text-muted">
        {notFound ? "주소를 다시 확인해 주세요." : "잠시 후 다시 시도해 주세요."}
      </p>
    </div>
  );
}
