import type { PrerenderEntrypoint } from "@vite-deploy/netlify";

export default {
	getStaticPaths() {
		return ["/"];
	},
} satisfies PrerenderEntrypoint;
