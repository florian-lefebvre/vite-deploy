import { rm, writeFile } from "node:fs/promises";
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
import { getRuntime } from "./utils.js";

const PACKAGE_NAME = packageJson.name;
const MAIN_INPUT = "index";
const ENTRYPOINT_VIRTUAL_MODULE = `virtual:${PACKAGE_NAME}/entrypoint`;

function validateMod(mod: Record<string, any>) {
	if (!("default" in mod && "fetch" in mod.default)) {
		throw new Error("Handler entrypoint returns an invalid shape");
	}
	return mod as {
		default: ExportedHandler;
	};
}

function configPlugin(
	options: Pick<Options, "handlerEntrypoint" | "output">,
): Plugin {
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
						outDir:
							options.output === "static" ? "dist" : ".vercel/output/static",
					},
				};
			}
			if (name === VITE_ENVIRONMENT_NAMES.server) {
				return {
					build: {
						outDir: ".vercel/output/functions/__server.func",
						rolldownOptions: {
							input: {
								[MAIN_INPUT]: ENTRYPOINT_VIRTUAL_MODULE,
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
				id: new RegExp(`^(${ENTRYPOINT_VIRTUAL_MODULE})$`),
			},
			handler() {
				return this.resolve(options.handlerEntrypoint.toString());
			},
		},
	};
}

export function vercel({
	handlerEntrypoint,
	requestLoggingLevel,
	...userOptions
}: Options): Array<Plugin> {
	return [
		configPlugin({ handlerEntrypoint, output: userOptions.output }),
		createBuildPlugin(),
		createHandlerPlugin({
			requestLoggingLevel,
			getDevMod: ({ serverEnvironment }) =>
				serverEnvironment.runner.import(ENTRYPOINT_VIRTUAL_MODULE),
			getPreviewMod: ({ outputDir }) =>
				import(join(outputDir, `${MAIN_INPUT}.mjs`)),
			onRequest: async ({ req, res, mod: unsafeMod }) => {
				const mod = validateMod(unsafeMod);

				let request: Request | undefined;

				try {
					// TODO: https://vercel.com/docs/headers/request-headers?framework=other
					request = new NodeRequest({ req, res });
					const response = await mod.default.fetch(request);
					await sendNodeResponse(res, response);
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
				const serverOutDir = join(
					serverEnvironment.config.root,
					serverEnvironment.config.build.outDir,
				);

				if (output === "static") {
					// Clear server bundle
					await rm(serverOutDir, {
						force: true,
						recursive: true,
					});
					return;
				}

				await writeFile(
					join(serverOutDir, "../../config.json"),
					JSON.stringify({
						version: 3,
						framework: {
							version: `${PACKAGE_NAME}@${packageJson.version}`,
						},
						routes: [
							{
								handle: "filesystem",
							},
							{
								src: "/.*",
								dest: "__server",
							},
						],
					}),
					"utf-8",
				);

				await writeFile(
					join(serverOutDir, ".vc-config.json"),
					JSON.stringify({
						runtime: getRuntime({
							nodeVersion: process.version,
							warn: serverEnvironment.logger.warn,
						}),
						handler: `${MAIN_INPUT}.mjs`,
						launcherType: "Nodejs",
						supportsResponseStreaming: true,
					}),
					"utf-8",
				);
			},
		}),
	];
}
