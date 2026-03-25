import type { NetlifyPluginOptions } from "@netlify/vite-plugin";

export type Format = "file" | "directory";

export type InternalOptions =
  | {
      output: "server";
    }
  | {
      output: "static" | "hybrid";
      // TODO: allow string, check wip astro node pr
      prerender: {
        entrypoint: URL;
        headers?: Headers;
        format?: Format;
      };
    };

export type Options = InternalOptions & {
  config?: Omit<NetlifyPluginOptions, "middleware">;
  serverEntrypoint: URL;
};

export interface PrerenderEntrypoint {
  getStaticPaths: () => Array<string> | Promise<Array<string>>;
}
