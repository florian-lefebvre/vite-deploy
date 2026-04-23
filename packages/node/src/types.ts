import type {
  ServerOptions as _ServerOptions,
  StaticOptions,
  HybridOptions as _HybridOptions,
  Entrypoint,
} from "@vite-deploy/internal-helpers";
import type { RequestListener } from "node:http";

interface SharedServerOptions {
  serverEntrypoint: Entrypoint;
}

interface ServerOptions extends _ServerOptions, SharedServerOptions {}
interface HybridOptions extends _HybridOptions, SharedServerOptions {}

export type Options = (ServerOptions | StaticOptions | HybridOptions) & {
  handlerEntrypoint: Entrypoint;
};

export type ExportedHandler =
  | {
      fetch: (request: Request) => Response | Promise<Response>;
    }
  | {
      handler: RequestListener;
    };
