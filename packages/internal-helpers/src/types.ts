export type Format = "file" | "directory";

export type PrerenderOptions =
  | {
      output: "server";
    }
  | {
      output: "static" | "hybrid";
      prerender: {
        entrypoint: Entrypoint;
        headers?: Headers;
        format?: Format;
      };
    };

export interface PrerenderEntrypoint {
  getStaticPaths: () => Array<string> | Promise<Array<string>>;
}

export type Entrypoint = string | URL;
