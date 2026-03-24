import type { PluginConfig } from "@cloudflare/vite-plugin";

export type InternalOptions =
  | {
      output: "server";
    }
  | {
      output: "static" | "hybrid";
      // TODO: allow string, check wip astro node pr
      prerenderEntrypoint: URL;
    };

export type Options = InternalOptions & {
  config?: Omit<PluginConfig, "viteEnvironment">;
};

export interface PrerenderEntrypoint {
  getStaticPaths: () => Array<string> | Promise<Array<string>>;
}
