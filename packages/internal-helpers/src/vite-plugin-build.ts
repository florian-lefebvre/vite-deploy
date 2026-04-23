import { VITE_ENVIRONMENT_NAMES } from "@vite-deploy/internal-helpers";
import { existsSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { type Manifest, type Plugin, type ResolvedConfig } from "vite";
import packageJson from "../package.json" with { type: "json" };

const PACKAGE_NAME = packageJson.name;
const CLIENT_FALLBACK_ENTRY_VIRTUAL_MODULE = `virtual:${PACKAGE_NAME}/client-fallback-entry`;
const RESOLVED_CLIENT_FALLBACK_ENTRY_VIRTUAL_MODULE =
  "\0" + CLIENT_FALLBACK_ENTRY_VIRTUAL_MODULE;
const CLIENT_FALLBACK_ENTRY_NAME = "__client_fallback_entry__";

function buildPlugin(): Plugin {
  return {
    name: `${PACKAGE_NAME}:build`,
    sharedDuringBuild: true,
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

function virtualClientFallbackPlugin(): Plugin {
  return {
    name: `${PACKAGE_NAME}:virtual-client-fallback`,
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
      handler() {
        return "";
      },
    },
  };
}

export function createBuildPlugin(): Array<Plugin> {
  return [buildPlugin(), virtualClientFallbackPlugin()];
}
