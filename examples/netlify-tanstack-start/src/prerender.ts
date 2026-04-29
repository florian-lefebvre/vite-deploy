import type { PrerenderEntrypoint } from "@vite-deploy/cloudflare";

export default {
  getStaticPaths() {
    return ["/"];
  },
} satisfies PrerenderEntrypoint;
