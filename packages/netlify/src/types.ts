import type { Context } from "@netlify/functions";
import type { NetlifyPluginOptions } from "@netlify/vite-plugin";
import type {
  PrerenderOptions,
  Entrypoint,
  PublicHandlerOptions,
} from "@vite-deploy/internal-helpers";

export type Options = PrerenderOptions &
  PublicHandlerOptions & {
    config?: Omit<NetlifyPluginOptions, "middleware" | "build">;
    handlerEntrypoint: Entrypoint;
  };

export interface ExportedHandler {
  fetch: (request: Request, context: Context) => Response | Promise<Response>;
}
