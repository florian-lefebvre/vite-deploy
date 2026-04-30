export type Format = "file" | "directory";

export interface ServerOptions {
  output: "server";
}

interface _PrerenderOptions {
  entrypoint: Entrypoint;
  headers?: Headers;
  format?: Format;
}

export interface StaticOptions {
  output: "static";
  prerender?: _PrerenderOptions;
}

export interface HybridOptions {
  output: "hybrid";
  prerender?: _PrerenderOptions;
}

export type PrerenderOptions = ServerOptions | StaticOptions | HybridOptions;

export interface PrerenderEntrypoint {
  getStaticPaths: () => Array<string> | Promise<Array<string>>;
}

export type Entrypoint = string | URL;

export interface PublicHandlerOptions {
  requestLoggingLevel?: "silent" | "info";
}
