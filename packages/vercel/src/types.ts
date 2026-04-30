import type {
  PrerenderOptions,
  Entrypoint,
  PublicHandlerOptions,
} from "@vite-deploy/internal-helpers";

export type Options = PrerenderOptions &
  PublicHandlerOptions & {
    /**
     * Specifies what module should be used. It accepts:
     *
     * - Paths relative to Vite's root: `./src/handler.ts`.
     * - Absolute paths: `/foo/handler.ts`.
     * - Package specifiers: `@my-pkg/handler`.
     * - URLs: `new URL("./src/handler.ts", import.meta.url)`.
     *
     * The module must return a {@link ExportedHandler}, which handles requests.
     */
    handlerEntrypoint: Entrypoint;
  };

export interface ExportedHandler {
  /**
   * Handles requests.
   */
  fetch: (request: Request) => Response | Promise<Response>;
}
