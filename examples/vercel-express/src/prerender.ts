import type { PrerenderEntrypoint } from "@vite-deploy/vercel";

export default {
	getStaticPaths() {
		return ["/"];
	},
} satisfies PrerenderEntrypoint;
