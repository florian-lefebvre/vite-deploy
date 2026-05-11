import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
	createBuildPlugin,
	createHandlerPlugin,
	createPrerenderPlugin,
	VITE_ENVIRONMENT_NAMES,
} from "@vite-deploy/internal-helpers";
import { NodeRequest, sendNodeResponse } from "srvx/node";
import type { Plugin } from "vite";
import packageJson from "../package.json" with { type: "json" };
import type { ExportedHandler, Options } from "./types.js";

const PACKAGE_NAME = packageJson.name;
const MAIN_INPUT = "index";
const HANDLER_INPUT = "handler";
const MAIN_ENTRYPOINT_VIRTUAL_MODULE = `virtual:${PACKAGE_NAME}/main-entrypoint`;
const HANDLER_ENTRYPOINT_VIRTUAL_MODULE = `virtual:${PACKAGE_NAME}/handler-entrypoint`;

function validateMod(mod: Record<string, any>) {
	if (
		!("default" in mod && ("fetch" in mod.default || "handler" in mod.default))
	) {
		throw new Error("Handler entrypoint returns an invalid shape");
	}
	return mod as {
		default: ExportedHandler;
	};
}

function configPlugin(options: Options): Plugin {
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
						outDir: options.output === "static" ? "dist" : "dist/client",
					},
				};
			}
			if (name === VITE_ENVIRONMENT_NAMES.server) {
				return {
					build: {
						outDir: options.output === "static" ? ".server" : "dist/server",
						rolldownOptions: {
							input: {
								...(options.output === "static"
									? {}
									: { [MAIN_INPUT]: MAIN_ENTRYPOINT_VIRTUAL_MODULE }),
								[HANDLER_INPUT]: HANDLER_ENTRYPOINT_VIRTUAL_MODULE,
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
					`^(${MAIN_ENTRYPOINT_VIRTUAL_MODULE}|${HANDLER_ENTRYPOINT_VIRTUAL_MODULE})$`,
				),
			},
			handler(id) {
				if (id === MAIN_ENTRYPOINT_VIRTUAL_MODULE) {
					return options.output === "static"
						? undefined
						: this.resolve(options.serverEntrypoint.toString());
				}
				return this.resolve(options.handlerEntrypoint.toString());
			},
		},
	};
}

export function node({
	handlerEntrypoint,
	requestLoggingLevel,
	...userOptions
}: Options): Array<Plugin> {
	return [
		configPlugin({ handlerEntrypoint, ...userOptions }),
		createBuildPlugin(),
		createHandlerPlugin({
			requestLoggingLevel,
			getDevMod: ({ serverEnvironment }) =>
				serverEnvironment.runner.import(HANDLER_ENTRYPOINT_VIRTUAL_MODULE),
			getPreviewMod: ({ outputDir }) =>
				import(join(outputDir, `${HANDLER_INPUT}.mjs`)),
			onRequest: async ({ req, res, mod: unsafeMod }) => {
				const mod = validateMod(unsafeMod);

				let clientAborted = false;
				let request: Request | undefined;

				if ("handler" in mod.default) {
					req.on("close", () => {
						if (!res.writableEnded) clientAborted = true;
					});
				}

				try {
					if ("handler" in mod.default) {
						mod.default.handler(req, res);
					} else {
						request = new NodeRequest({ req, res });
						const response = await mod.default.fetch(request);
						await sendNodeResponse(res, response);
					}
					return { type: "success" };
				} catch (error) {
					const aborted =
						"handler" in mod.default
							? clientAborted
							: (request?.signal.aborted ?? false);
					return aborted
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
