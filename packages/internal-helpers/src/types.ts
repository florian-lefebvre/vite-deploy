export type Format = "file" | "directory";

export interface ServerOptions {
	/**
	 * Specifies the output target for builds.
	 */
	output: "server";
}

interface _PrerenderOptions {
	/**
	 * Specifies the module that lists the routes to prerender. It accepts:
	 *
	 * - Paths relative to Vite's root: `./src/prerender.ts`.
	 * - Absolute paths: `/foo/prerender.ts`.
	 * - Package specifiers: `@my-pkg/prerender`.
	 * - URLs: `new URL("./src/prerender.ts", import.meta.url)`.
	 *
	 * The module must return a {@link PrerenderEntrypoint}, which lists URLs to prerender.
	 * It is processed by Vite.
	 */
	entrypoint: Entrypoint;

	/**
	 * Specifies headers attached to each request the build sends to your handler during
	 * prerendering. Useful for flagging prerender requests so the handler can branch on them,
	 * or for supplying credentials your handler expects.
	 */
	headers?: Headers;

	/**
	 * Specifies the output file format of each page:
	 *
	 * - `"file"`: Vite Deploy will generate an HTML file named for each page route. (e.g.
	 * `/foo` and `/foo.html` both build the file `/foo.html`).
	 * - `"directory"`: Vite Deploy will generate a directory with a nested `index.html`
	 * file for each page. (e.g. `/foo` and `/foo.html` both build the file `/foo/index.html`).
	 *
	 * @default `"file"`
	 */
	format?: Format;
}

export interface StaticOptions {
	/**
	 * Specifies the output target for builds.
	 */
	output: "static";

	/**
	 * Specifies options related to prerendering. Can only be specified if
	 * {@link StaticOptions.output|output} is set to `"static"` or `"hybrid"`.
	 */
	prerender?: _PrerenderOptions;
}

export interface HybridOptions {
	/**
	 * Specifies the output target for builds.
	 */
	output: "hybrid";

	/**
	 * Specifies options related to prerendering. Can only be specified if
	 * {@link StaticOptions.output|output} is set to `"static"` or `"hybrid"`.
	 */
	prerender?: _PrerenderOptions;
}

export type PrerenderOptions = ServerOptions | StaticOptions | HybridOptions;

export interface PrerenderEntrypoint {
	/**
	 * Lists URLs to prerender.
	 */
	getStaticPaths: () => Array<string> | Promise<Array<string>>;
}

export type Entrypoint = string | URL;

export interface PublicHandlerOptions {
	/**
	 * Specifies if requests are logged in the terminal. It can be disabled if
	 * you already handle logging at runtime.
	 *
	 * @default `"info"`
	 */
	requestLoggingLevel?: "silent" | "info";
}
