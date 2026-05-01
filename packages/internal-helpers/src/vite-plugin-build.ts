// Source: https://github.com/cloudflare/workers-sdk/blob/4d4d2c25e3a7b677ef1b9aa430e058cad9285558/packages/vite-plugin-cloudflare/src/build.ts

import { existsSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { VITE_ENVIRONMENT_NAMES } from "@vite-deploy/internal-helpers";
import type { Manifest, Plugin, ResolvedConfig } from "vite";
import packageJson from "../package.json" with { type: "json" };

const PACKAGE_NAME = packageJson.name;
const CLIENT_FALLBACK_ENTRY_VIRTUAL_MODULE = `virtual:${PACKAGE_NAME}/client-fallback-entry`;
const RESOLVED_CLIENT_FALLBACK_ENTRY_VIRTUAL_MODULE =
	"\0" + CLIENT_FALLBACK_ENTRY_VIRTUAL_MODULE;
const CLIENT_FALLBACK_ENTRY_NAME = "__client_fallback_entry__";

/**
 * A Vite plugin which coordinates the environments build and allows
 * building a Vite project without client assets.
 */
export function createBuildPlugin(): Plugin {
	return {
		name: `${PACKAGE_NAME}:build`,
		sharedDuringBuild: true,
		applyToEnvironment(environment) {
			return environment.name === VITE_ENVIRONMENT_NAMES.client;
		},
		resolveId: {
			filter: {
				id: new RegExp(`^(${CLIENT_FALLBACK_ENTRY_VIRTUAL_MODULE})$`),
			},
			handler() {
				return RESOLVED_CLIENT_FALLBACK_ENTRY_VIRTUAL_MODULE;
			},
		},
		load: {
			filter: {
				id: new RegExp(`^(${RESOLVED_CLIENT_FALLBACK_ENTRY_VIRTUAL_MODULE})$`),
			},
			// If there are no client assets, use empty this virtual module as entry. It will be
			// removed after the client environment is built.
			handler() {
				return "";
			},
		},
		config() {
			return {
				builder: {
					async buildApp(builder) {
						const serverEnv =
							builder.environments[VITE_ENVIRONMENT_NAMES.server];
						const clientEnv =
							builder.environments[VITE_ENVIRONMENT_NAMES.client];
						if (!serverEnv || !clientEnv) {
							throw new Error("Missing environments");
						}

						await builder.build(serverEnv);

						const defaultHtmlPath = join(builder.config.root, "index.html");
						const hasClientEntry =
							clientEnv.config.build.rolldownOptions.input ||
							existsSync(defaultHtmlPath);
						const entryWorkerBuildDirectory = join(
							builder.config.root,
							serverEnv.config.build.outDir,
						);
						const entryWorkerManifest = loadViteManifest(
							entryWorkerBuildDirectory,
						);
						const importedAssetPaths =
							getImportedAssetPaths(entryWorkerManifest);

						if (hasClientEntry) {
							await builder.build(clientEnv);
						} else if (
							importedAssetPaths.size ||
							getHasPublicAssets(builder.config)
						) {
							clientEnv.config.build.rolldownOptions.input =
								CLIENT_FALLBACK_ENTRY_VIRTUAL_MODULE;
							clientEnv.config.build.rolldownOptions.logLevel = "silent";
							clientEnv.config.build.rolldownOptions.output = {
								entryFileNames: CLIENT_FALLBACK_ENTRY_NAME,
							};

							await builder.build(clientEnv);

							const fallbackEntryPath = join(
								builder.config.root,
								clientEnv.config.build.outDir,
								CLIENT_FALLBACK_ENTRY_NAME,
							);

							unlinkSync(fallbackEntryPath);
						}
					},
				},
			};
		},
	};
}

function getHasPublicAssets({
	publicDir,
}: Pick<ResolvedConfig, "publicDir">): boolean {
	let hasPublicAssets = false;

	if (publicDir) {
		try {
			const files = readdirSync(publicDir);

			if (files.length) {
				hasPublicAssets = true;
			}
		} catch {}
	}

	return hasPublicAssets;
}

function getImportedAssetPaths(viteManifest: Manifest): Set<string> {
	const assetPaths = Object.values(viteManifest).flatMap(
		(chunk) => chunk.assets ?? [],
	);

	return new Set(assetPaths);
}

function loadViteManifest(directory: string) {
	const contents = readFileSync(
		join(directory, ".vite", "manifest.json"),
		"utf-8",
	);

	return JSON.parse(contents) as Manifest;
}
