import type { PluginConfig } from "@cloudflare/vite-plugin";
import type { PrerenderOptions } from "@vite-deploy/internal-helpers";

export type Options = PrerenderOptions & {
	/**
	 * Options forwarded to [`@cloudflare/vite-plugin`](https://developers.cloudflare.com/workers/vite-plugin/),
	 * except `viteEnvironment`.
	 */
	config?: Omit<PluginConfig, "viteEnvironment">;
};
