import type { PluginConfig } from "@cloudflare/vite-plugin";
import type { PrerenderOptions } from "@vite-deploy/internal-helpers";

export type Options = PrerenderOptions & {
  config?: Omit<PluginConfig, "viteEnvironment">;
};
