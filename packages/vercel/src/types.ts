import type {
  PrerenderOptions,
  Entrypoint,
  PublicHandlerOptions,
} from "@vite-deploy/internal-helpers";

export type Options = PrerenderOptions &
  PublicHandlerOptions & {
    handlerEntrypoint: Entrypoint;
  };

export interface ExportedHandler {
  fetch: (request: Request) => Response | Promise<Response>;
}
