import { rm } from "node:fs/promises";
import { join } from "node:path";
import netlifyPlugin from "@netlify/vite-plugin";
import { createRequest, sendResponse } from "@remix-run/node-fetch-server";
import {
	createBuildPlugin,
	createHandlerPlugin,
	createPrerenderPlugin,
	VITE_ENVIRONMENT_NAMES,
} from "@vite-deploy/internal-helpers";
import type { Plugin } from "vite";
import packageJson from "../package.json" with { type: "json" };
import type { ExportedHandler, Options } from "./types.js";

const PACKAGE_NAME = packageJson.name;
const MAIN_INPUT = "index";
const HANDLER_ENTRYPOINT_VIRTUAL_MODULE = `virtual:${PACKAGE_NAME}/handler-entrypoint`;
const PRODUCTION_HANDLER_VIRTUAL_MODULE = `virtual:${PACKAGE_NAME}/production-handler`;
const RESOLVED_PRODUCTION_HANDLER_VIRTUAL_MODULE =
	"\0" + PRODUCTION_HANDLER_VIRTUAL_MODULE;

function validateMod(mod: Record<string, any>) {
	if (!("default" in mod && "fetch" in mod.default)) {
		throw new Error("Handler entrypoint returns an invalid shape");
	}
	return mod as {
		default: ExportedHandler;
	};
}

function parseBase64JSON<T = unknown>(header: any): T | undefined {
	if (typeof header === "string") {
		try {
			return JSON.parse(Buffer.from(header, "base64").toString("utf8"));
		} catch {}
	}
}

function configPlugin(options: Pick<Options, "handlerEntrypoint">): Plugin {
	return {
		name: `${PACKAGE_NAME}:config`,
		sharedDuringBuild: true,
		applyToEnvironment(environment) {
			return environment.name === VITE_ENVIRONMENT_NAMES.server;
		},
		config() {
			return {
				environments: {
					[VITE_ENVIRONMENT_NAMES.server]: {},
				},
			};
		},
		configEnvironment(name) {
			if (name === VITE_ENVIRONMENT_NAMES.client) {
				return {
					build: {
						outDir: "dist",
					},
				};
			}
			if (name === VITE_ENVIRONMENT_NAMES.server) {
				return {
					build: {
						outDir: ".netlify/v1/functions",
						rolldownOptions: {
							input: {
								[MAIN_INPUT]: PRODUCTION_HANDLER_VIRTUAL_MODULE,
							},
						},
						manifest: true,
						copyPublicDir: false,
					},
				};
			}
		},
		resolveId: {
			filter: {
				id: new RegExp(
					`^(${HANDLER_ENTRYPOINT_VIRTUAL_MODULE}|${PRODUCTION_HANDLER_VIRTUAL_MODULE})$`,
				),
			},
			handler(id, ...args) {
				if (id === HANDLER_ENTRYPOINT_VIRTUAL_MODULE) {
					return this.resolve(options.handlerEntrypoint.toString(), ...args);
				}
				return RESOLVED_PRODUCTION_HANDLER_VIRTUAL_MODULE;
			},
		},
		// The shape of the handler and the expected Netlify function handler slightly differs
		load: {
			filter: {
				id: new RegExp(`^(${RESOLVED_PRODUCTION_HANDLER_VIRTUAL_MODULE})$`),
			},
			handler() {
				return `
import handlerEntrypoint from "${HANDLER_ENTRYPOINT_VIRTUAL_MODULE}";

export default handlerEntrypoint.fetch;

export const config = {
  name: "${PACKAGE_NAME} server handler",
  generator: "${PACKAGE_NAME}@${packageJson.version}",
  path: "/*",
  preferStatic: true,
};
`;
			},
		},
	};
}

export function netlify({
	config,
	handlerEntrypoint,
	requestLoggingLevel,
	...userOptions
}: Options): Array<Plugin> {
	return [
		...netlifyPlugin({
			...config,
			middleware: true,
		}),
		configPlugin({ handlerEntrypoint }),
		createBuildPlugin(),
		createHandlerPlugin({
			requestLoggingLevel,
			getDevMod: ({ serverEnvironment }) =>
				serverEnvironment.runner.import(HANDLER_ENTRYPOINT_VIRTUAL_MODULE),
			getPreviewMod: async ({ outputDir }) => {
				// The production handler exports a default function instead of a `Fetchable`, normalize
				const mod = await import(join(outputDir, `${MAIN_INPUT}.mjs`));
				return {
					default: {
						fetch: mod.default,
					},
				};
			},
			onRequest: async ({ req, res, mod: unsafeMod }) => {
				const mod = validateMod(unsafeMod);

				let request: Request | undefined;

				try {
					request = createRequest(req, res);

					// TODO: implement missing
					const response = await mod.default.fetch(request, {
						get url() {
							return new URL(request!.url);
						},
						// The dev server is a long running process, so promises will run even with a noop
						waitUntil: () => {},
						account: parseBase64JSON("x-nf-account-info") ?? {
							id: "mock-netlify-account-id",
						},
						deploy: {
							context: "dev",
							id:
								typeof req.headers["x-nf-deploy-id"] === "string"
									? req.headers["x-nf-deploy-id"]
									: "mock-netlify-deploy-id",
							published: false,
						},
						site: parseBase64JSON("x-nf-site-info") ?? {
							id: "mock-netlify-site-id",
							name: "mock-netlify-site.netlify.app",
							url: new URL(request.url).origin,
						},
						geo: parseBase64JSON("x-nf-geo") ?? {
							city: "Mock City",
							country: { code: "mock", name: "Mock Country" },
							subdivision: { code: "SD", name: "Mock Subdivision" },
							timezone: "UTC",
							longitude: 0,
							latitude: 0,
						},
						ip:
							typeof req.headers["x-nf-client-connection-ip"] === "string"
								? req.headers["x-nf-client-connection-ip"]
								: (req.socket.remoteAddress ?? "127.0.0.1"),
						server: {
							region: "local-dev",
						},
						requestId:
							typeof req.headers["x-nf-request-id"] === "string"
								? req.headers["x-nf-request-id"]
								: "mock-netlify-request-id",
						get cookies(): never {
							throw new Error("Not implemented.");
						},
						json: (input) => Response.json(input),
						log: console.info,
						next() {
							throw new Error("Not implemented.");
						},
						get params(): never {
							throw new Error("Not implemented.");
						},
						rewrite() {
							throw new Error("Not implemented.");
						},
					});
					await sendResponse(res, response);

					return { type: "success" };
				} catch (error) {
					return request?.signal.aborted
						? { type: "error", aborted: true }
						: { type: "error", aborted: false, error };
				}
			},
		}),
		createPrerenderPlugin({
			userOptions,
			onBuildDone: async ({ output, serverEnvironment }) => {
				if (output !== "static") return;

				// Clear server bundle
				await rm(
					join(
						serverEnvironment.config.root,
						serverEnvironment.config.build.outDir,
					),
					{
						force: true,
						recursive: true,
					},
				);
			},
		}),
	];
}
