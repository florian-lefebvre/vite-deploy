import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cloudflare as cloudflarePlugin } from "@cloudflare/vite-plugin";
import {
	createPrerenderPlugin,
	VITE_ENVIRONMENT_NAMES,
} from "@vite-deploy/internal-helpers";
import type { Plugin } from "vite";
import packageJson from "../package.json" with { type: "json" };
import type { Options } from "./types.js";

const PACKAGE_NAME = packageJson.name;

export function cloudflare({ config, ...userOptions }: Options): Array<Plugin> {
	return [
		...cloudflarePlugin({
			...config,
			viteEnvironment: { name: VITE_ENVIRONMENT_NAMES.server },
		}),
		createPrerenderPlugin({
			userOptions,
			// May be handled ootb by https://github.com/cloudflare/workers-sdk/pull/12788
			onBuildDone: async ({ output, serverEnvironment, clientEnvironment }) => {
				if (output === "static") {
					// Clear server bundle but keep the wrangler config. Needs removing the main field
					// to indicate as an assets-only worker
					const serverOutDir = join(
						serverEnvironment.config.root,
						serverEnvironment.config.build.outDir,
					);
					const wranglerPath = join(serverOutDir, "wrangler.json");
					const wranglerConfig = JSON.parse(
						await readFile(wranglerPath, "utf-8"),
					);
					wranglerConfig.main = undefined;
					await rm(serverOutDir, { force: true, recursive: true });
					await mkdir(serverOutDir, { recursive: true });
					await writeFile(
						wranglerPath,
						JSON.stringify(wranglerConfig),
						"utf-8",
					);
					return;
				}

				// Inject headers
				const headersPath = join(
					clientEnvironment.config.root,
					clientEnvironment.config.build.outDir,
					"_headers",
				);
				const rule = `/${serverEnvironment.config.build.assetsDir}/*`;
				let headers = "";
				try {
					headers = await readFile(headersPath, "utf-8");
				} catch {
					// Doesn't exist yet
				}
				if (headers.includes(rule)) {
					clientEnvironment.logger.warn(
						`Rule for ${rule} already defined in _headers. Skipping static assets cache rule.`,
					);
					return;
				}
				headers += `\n${rule}\n  Cache-Control: public, max-age=31536000, immutable\n`;
				await writeFile(headersPath, headers.trim(), "utf-8");
			},
		}),
		{
			name: `${PACKAGE_NAME}:config`,
			sharedDuringBuild: true,
			configEnvironment(name) {
				if (name === VITE_ENVIRONMENT_NAMES.server) {
					return {
						build: {
							outDir: "dist/server",
						},
					};
				}
			},
		},
	];
}
