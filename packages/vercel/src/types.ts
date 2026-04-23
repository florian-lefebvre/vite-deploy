import type {
  PrerenderOptions,
  Entrypoint,
} from "@vite-deploy/internal-helpers";

export type Options = PrerenderOptions & {
  handlerEntrypoint: Entrypoint;
};

export interface ExportedHandler {
  fetch: (request: Request) => Response | Promise<Response>;
}
