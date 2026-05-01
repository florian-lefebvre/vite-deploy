import type { Context } from "@netlify/functions";
import type { NetlifyPluginOptions } from "@netlify/vite-plugin";
import type {
	Entrypoint,
	PrerenderOptions,
	PublicHandlerOptions,
} from "@vite-deploy/internal-helpers";

export type Options = PrerenderOptions &
	PublicHandlerOptions & {
		/**
		 * Options forwarded to [`@netlify/vite-plugin`](https://www.npmjs.com/package/@netlify/vite-plugin),
		 * except `middleware` and `build`.
		 */
		config?: Omit<NetlifyPluginOptions, "middleware" | "build">;

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
	 * Handles requests. Receives Netlify's context as 2nd argument.
	 */
	fetch: (request: Request, context: Context) => Response | Promise<Response>;
}
