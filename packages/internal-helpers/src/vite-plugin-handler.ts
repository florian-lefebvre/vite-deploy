import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { styleText } from "node:util";
import sirv from "sirv";
import {
	type Connect,
	isRunnableDevEnvironment,
	type Plugin,
	type ResolvedConfig,
	type RunnableDevEnvironment,
} from "vite";
import packageJson from "../package.json" with { type: "json" };
import { VITE_ENVIRONMENT_NAMES } from "./constants.js";
import type { PublicHandlerOptions } from "./types.js";
import { getTimeStat } from "./utils.js";

const PACKAGE_NAME = packageJson.name;

interface Options
	extends PublicHandlerOptions,
		Pick<MiddlewareOptions, "onRequest"> {
	/**
	 * Retrieves the handler module in development.
	 */
	getDevMod: (params: {
		serverEnvironment: RunnableDevEnvironment;
	}) => Promise<Record<string, any>>;
	/**
	 * Retrieves the handler module in preview (and prerendering).
	 */
	getPreviewMod: (params: {
		outputDir: string;
	}) => Promise<Record<string, any>>;
}

interface MiddlewareOptions {
	getMod: () => Promise<Record<string, any>>;
	/**
	 * Handle request handling, such as converting to a standard web Request.
	 */
	onRequest: (params: {
		req: IncomingMessage;
		res: ServerResponse;
		mod: Record<string, any>;
	}) => Promise<
		| {
				type: "success";
		  }
		| ({
				type: "error";
		  } & ({ aborted: true } | { aborted: false; error: unknown }))
	>;
	onResponse:
		| ((params: { url: string; status: number; duration: number }) => void)
		| undefined;
}

// Source: https://github.com/cloudflare/workers-sdk/blob/4d4d2c25e3a7b677ef1b9aa430e058cad9285558/packages/vite-plugin-cloudflare/src/utils.ts#L63
function createMiddleware({
	getMod,
	onRequest,
	onResponse,
}: MiddlewareOptions): Connect.NextHandleFunction {
	return async function middleware(req, res, next) {
		try {
			const now = performance.now();
			// Built in vite middleware trims out the base path when passing in the request
			// We can restore it by using the `originalUrl` property
			// This makes sure the worker receives the correct url in both dev using vite and production
			if (req.originalUrl) {
				req.url = req.originalUrl;
			}
			const result = await onRequest({ req, res, mod: await getMod() });

			if (result.type === "error") {
				// If the request was aborted, ignore the error
				if (result.aborted) return;
				throw result.error;
			}

			// Vite uses HTTP/2 when `server.https` or `preview.https` is enabled
			if (req.httpVersionMajor === 2) {
				// HTTP/2 disallows use of the `transfer-encoding` header
				res.removeHeader("transfer-encoding");
			}

			onResponse?.({
				duration: performance.now() - now,
				status: res.statusCode,
				url: req.url || "/",
			});
		} catch (error) {
			next(error);
		}
	};
}

/**
 * A Vite plugin which forwards requests to the user handler in development
 * and preview.
 */
export function createHandlerPlugin(options: Options): Plugin {
	let config: ResolvedConfig;
	const onResponse: MiddlewareOptions["onResponse"] =
		(options.requestLoggingLevel ?? "info") === "silent"
			? undefined
			: ({ duration, status, url }) => {
					console.log(
						`${styleText("bold", "GET")} ${url || "/"} ${styleText("bold", styleText("green", status.toString()))} ${status >= 200 && status < 300 ? styleText("green", "OK") : styleText("red", "NOT OK")} (${getTimeStat(duration)})`,
					);
				};

	return {
		name: `${PACKAGE_NAME}:handler`,
		sharedDuringBuild: true,
		configResolved(_config) {
			config = _config;
		},
		configureServer(server) {
			return () => {
				server.middlewares.use(
					createMiddleware({
						getMod: () => {
							const serverEnvironment =
								server.environments[VITE_ENVIRONMENT_NAMES.server];
							if (!isRunnableDevEnvironment(serverEnvironment)) {
								throw new Error("Non runnable server env");
							}
							return options.getDevMod({ serverEnvironment });
						},
						onRequest: options.onRequest,
						onResponse,
					}),
				);
			};
		},
		configurePreviewServer(server) {
			server.middlewares.use((req, res, next) => {
				sirv(
					join(
						config.root,
						config.environments[VITE_ENVIRONMENT_NAMES.client]!.build.outDir,
					),
					{
						dev: true,
					},
				)(req, res, next);
				if (res.headersSent) {
					onResponse?.({
						duration: 0,
						status: res.statusCode,
						url: req.url || "/",
					});
				}
			});
			server.middlewares.use(
				createMiddleware({
					getMod: () =>
						options.getPreviewMod({
							outputDir: join(
								config.root,
								config.environments[VITE_ENVIRONMENT_NAMES.server]!.build
									.outDir,
							),
						}),
					onRequest: options.onRequest,
					onResponse,
				}),
			);
		},
	};
}
