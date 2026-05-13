// Source: https://github.com/TanStack/router/blob/7fa0f39cabf4407aa1cb99e369566e8ea85554a2/packages/start-plugin-core/src/vite/prerender.ts

import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { styleText } from "node:util";
import {
	type BuildEnvironment,
	type Plugin,
	preview,
	type ResolvedConfig,
} from "vite";
import packageJson from "../package.json" with { type: "json" };
import { VITE_ENVIRONMENT_NAMES } from "./constants.js";
import type { PrerenderOptions } from "./types.js";
import {
	getRouteFilename,
	getStaticPaths,
	getTimeStat,
	isRedirectResponse,
	localFetch,
	normalizePaths,
} from "./utils.js";

const PACKAGE_NAME = packageJson.name;
const PRERENDER_INPUT = "prerender";
const ENTRYPOINT_VIRTUAL_MODULE = `virtual:${PACKAGE_NAME}/entrypoint`;

interface Options {
	/**
	 * Prerender related options, from the user.
	 */
	userOptions: PrerenderOptions;
	/**
	 * A hook that fires when a build is done.
	 */
	onBuildDone?: (params: {
		output: PrerenderOptions["output"];
		serverEnvironment: BuildEnvironment;
		clientEnvironment: BuildEnvironment;
	}) => void | Promise<void>;
}

/**
 * A Vite plugin which handles prerendering.
 */
export function createPrerenderPlugin({
	userOptions,
	onBuildDone,
}: Options): Plugin {
	// In server mode, it's always set to false
	let prerender =
		// If static, there's only one build it can directly be set to true
		userOptions.output === "static" ||
		// If hybrid, there's only a 2nd build if the user wants prerendering.
		// In that case, it starts at true and it will change to false for the
		// server build. If that's not the case, it is directly set to true
		(userOptions.output === "hybrid" && userOptions.prerender);
	let cleaned = false;
	let config: ResolvedConfig;

	return {
		name: `${PACKAGE_NAME}:prerender`,
		enforce: "post",
		sharedDuringBuild: true,
		configEnvironment(name, config) {
			if (name === VITE_ENVIRONMENT_NAMES.server) {
				config.build ??= {};
				config.build.rolldownOptions ??= {};
				config.build.rolldownOptions.output ??= [];
				if (!Array.isArray(config.build.rolldownOptions.output)) {
					config.build.rolldownOptions.output = [
						config.build.rolldownOptions.output,
					];
				}
				// Emit mjs files to force interpreting as ESM
				config.build.rolldownOptions.output.push({
					entryFileNames: "[name].mjs",
				});

				if (userOptions.output !== "server") {
					// Clean the prerender specific files when running the full server build
					config.build.emptyOutDir = true;

					// We normalize the rolldown input because the object is the only one
					// which allows identifying specific ones
					if (typeof config.build.rolldownOptions.input === "string") {
						config.build.rolldownOptions.input = {
							index: config.build.rolldownOptions.input,
						};
					} else if (Array.isArray(config.build.rolldownOptions.input)) {
						config.build.rolldownOptions.input = Object.fromEntries(
							config.build.rolldownOptions.input.map((v, i) => [
								`index_${i}`,
								v,
							]),
						);
					}

					config.build.rolldownOptions.input ??= {};
					if (userOptions.prerender) {
						config.build.rolldownOptions.input[PRERENDER_INPUT] =
							ENTRYPOINT_VIRTUAL_MODULE;
					}
				}
			}
		},
		configResolved(_config) {
			config = _config;
		},
		resolveId: {
			filter: {
				id: new RegExp(`^(${ENTRYPOINT_VIRTUAL_MODULE})$`),
			},
			handler() {
				return userOptions.output !== "server" && userOptions.prerender
					? this.resolve(userOptions.prerender.entrypoint.toString())
					: undefined;
			},
		},
		// We can't use define for some reason
		transform: {
			order: "pre",
			filter: {
				code: {
					include: "import.meta.env.PRERENDER",
				},
			},
			handler(code) {
				if (this.environment.name === VITE_ENVIRONMENT_NAMES.server) {
					return code.replaceAll(
						"import.meta.env.PRERENDER",
						JSON.stringify(prerender),
					);
				}
			},
		},
		async buildStart() {
			if (cleaned) return;

			// We can't just use build.emptyOutDir because it wouldn't necessarily run
			// when changing the output mode. Instead we try clearing the parent folder
			// if it's not the project root (eg. /dist/client => /dist/)
			for (const environment of Object.values(config.environments)) {
				const candidate = dirname(join(config.root, environment.build.outDir));
				if (candidate === config.root) {
					continue;
				}
				await rm(dirname(join(config.root, environment.build.outDir)), {
					force: true,
					recursive: true,
				});
			}

			cleaned = true;
		},
		buildApp: {
			// Ensures environments are built by now
			order: "post",
			async handler(builder) {
				const serverEnvironment =
					builder.environments[VITE_ENVIRONMENT_NAMES.server];
				const clientEnvironment =
					builder.environments[VITE_ENVIRONMENT_NAMES.client];
				if (!serverEnvironment || !clientEnvironment) {
					throw new Error("Missing environments");
				}

				if (userOptions.output === "server") {
					await onBuildDone?.({
						output: "server",
						serverEnvironment,
						clientEnvironment,
					});
					return;
				}

				if (userOptions.prerender) {
					const prerenderEntrypointMod = await import(
						join(
							serverEnvironment.config.root,
							serverEnvironment.config.build.outDir,
							`${PRERENDER_INPUT}.mjs`,
						)
					);
					// TODO: consider allow generators so that prerendering some routes
					// can discover more routes. or a context based API like ctx.enqueue(...urls)
					const paths = normalizePaths(
						await getStaticPaths(prerenderEntrypointMod),
					);

					serverEnvironment.logger.info(
						`\nprerendering (${paths.length} route${paths.length === 1 ? "" : "s"})...\n`,
					);
					const now = performance.now();

					const previewServer = await preview({
						root: serverEnvironment.config.root,
						configFile: serverEnvironment.config.configFile,
						preview: {
							port: 0,
							open: false,
						},
						logLevel: serverEnvironment.config.logLevel,
					});
					const localUrl = previewServer.resolvedUrls?.local.at(0);
					if (!localUrl) {
						throw new Error("Could not find url");
					}
					const baseUrl = new URL(localUrl);

					for (const path of paths) {
						const res = await localFetch({
							path,
							baseUrl,
							warn: serverEnvironment.logger.warn,
							fetch: globalThis.fetch,
							options: {
								headers: userOptions.prerender.headers,
							},
						});

						if (!res.ok) {
							if (isRedirectResponse(res)) {
								serverEnvironment.logger.warn(
									`Max redirects reached for ${path}`,
								);
							}
							throw new Error(`Failed to fetch ${path}: ${res.statusText}`, {
								cause: res,
							});
						}

						const cleanPagePath = path.split(/[?#]/)[0];

						const filename = getRouteFilename({
							path: cleanPagePath,
							format: userOptions.prerender.format ?? "file",
							htmlContentType: !!res.headers
								.get("content-type")
								?.includes("html"),
						});

						const html = await res.text();

						const filepath = join(
							clientEnvironment.config.root,
							clientEnvironment.config.build.outDir,
							filename,
						);

						await mkdir(dirname(filepath), { recursive: true });
						await writeFile(filepath, html);
					}

					await previewServer.close();
					serverEnvironment.logger.info(
						styleText(
							"green",
							`\n✓ prerendered in ${getTimeStat(performance.now() - now)}${userOptions.output === "static" ? "" : "\n"}`,
						),
					);
				}

				if (userOptions.output === "static") {
					await onBuildDone?.({
						output: "static",
						serverEnvironment,
						clientEnvironment,
					});
					return;
				}

				// We only run another build if prerendering was run
				if (userOptions.prerender) {
					// It is normalized by now
					delete (
						serverEnvironment.config.build.rolldownOptions.input as Record<
							string,
							string
						>
					).prerender;
					prerender = false;

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
					await builder.build(serverEnvironment);
				}

				await onBuildDone?.({
					output: "hybrid",
					serverEnvironment,
					clientEnvironment,
				});
			},
		},
	};
}
