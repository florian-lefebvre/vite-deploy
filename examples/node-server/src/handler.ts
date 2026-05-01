import type { ExportedHandler } from "@vite-deploy/node";

export default {
	fetch(request) {
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
