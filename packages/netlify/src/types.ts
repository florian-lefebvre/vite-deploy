import type { Context } from "@netlify/functions";
import type { NetlifyPluginOptions } from "@netlify/vite-plugin";
import type {
  PrerenderOptions,
  Entrypoint,
} from "@vite-deploy/internal-helpers";

export type Options = PrerenderOptions & {
  config?: Omit<NetlifyPluginOptions, "middleware">;
  handlerEntrypoint: Entrypoint;
};

export interface ExportedHandler {
  fetch: (request: Request, context: Context) => Response | Promise<Response>;
}
