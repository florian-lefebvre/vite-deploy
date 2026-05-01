import type { ExportedHandler } from "@vite-deploy/netlify";

export default {
	fetch(request, context) {
		console.log(context.ip);
		const url = new URL(request.url);
		if (url.pathname === "/") {
			return new Response("<div>foo</div>", {
				status: 200,
				headers: {
					"Content-Type": "text/html",
				},
			});
		}
		return new Response(`Running ${url.pathname} in ${navigator.userAgent}!`);
	},
} satisfies ExportedHandler;
