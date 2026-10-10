import { createRequestHandler } from "react-router";
import { needsNoindex } from "../app/lib/robots";

declare module "react-router" {
	export interface AppLoadContext {
		cloudflare: {
			env: Env;
			ctx: ExecutionContext;
		};
	}
}

const requestHandler = createRequestHandler(
	() => import("virtual:react-router/server-build"),
	import.meta.env.MODE,
);

export default {
	async fetch(request, env, ctx) {
		const res = await requestHandler(request, {
			cloudflare: { env, ctx },
		});
		if (!needsNoindex(new URL(request.url).pathname)) return res;
		// Response headers may be immutable: rebuild the response, keeping body, status and all headers (incl. Set-Cookie).
		const out = new Response(res.body, res);
		out.headers.set("X-Robots-Tag", "noindex, nofollow");
		return out;
	},
} satisfies ExportedHandler<Env>;
