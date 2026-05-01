import type { PrerenderEntrypoint } from "@vite-deploy/node";

export default {
	getStaticPaths() {
		return ["/"];
	},
} satisfies PrerenderEntrypoint;
