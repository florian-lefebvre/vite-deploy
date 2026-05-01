import type { RequestListener } from "node:http";
import type {
	HybridOptions as _HybridOptions,
	ServerOptions as _ServerOptions,
	Entrypoint,
	PublicHandlerOptions,
	StaticOptions,
} from "@vite-deploy/internal-helpers";

interface SharedServerOptions {
	/**
	 * Required if {@link Options.output|output} is set to `"server"` or `"hybrid"`.
	 * Specifies what module should be used. It accepts:
	 *
	 * - Paths relative to Vite's root: `./src/server.ts`.
	 * - Absolute paths: `/foo/server.ts`.
	 * - Package specifiers: `@my-pkg/server`.
	 * - URLs: `new URL("./src/server.ts", import.meta.url)`.
	 *
	 * The module can contain anything. You need to implement what you'll need for your production
	 * server needs, including serving static assets.
	 */
	serverEntrypoint: Entrypoint;
}

interface ServerOptions extends _ServerOptions, SharedServerOptions {}
interface HybridOptions extends _HybridOptions, SharedServerOptions {}

export type Options = (ServerOptions | StaticOptions | HybridOptions) &
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

export type ExportedHandler =
	| {
			/**
			 * Handles requests.
			 */
			fetch: (request: Request) => Response | Promise<Response>;
	  }
	| {
			/**
			 * Handles requests.
			 */
			handler: RequestListener;
	  };
