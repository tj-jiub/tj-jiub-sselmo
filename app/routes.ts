import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("find", "routes/find.tsx"),
  route("spaces", "routes/spaces.tsx"),
  route("s/:slug", "routes/survey.tsx"),
  route("r/:slug", "routes/public-report.tsx"),
  route("apply/:slug", "routes/apply.tsx"),
  route("result/:token", "routes/result.tsx"),
  route("admin/login", "routes/admin-login.tsx"),
  route("admin/logout", "routes/admin-logout.tsx"),
  route("admin/files/*", "routes/admin-file.tsx"),
  layout("routes/admin-layout.tsx", [
    route("admin", "routes/admin-index.tsx"),
    route("admin/spaces/new", "routes/admin-space-new.tsx"),
    route("admin/spaces/:id", "routes/admin-space.tsx"),
    route("admin/applications/:id", "routes/admin-application.tsx"),
  ]),
] satisfies RouteConfig;
