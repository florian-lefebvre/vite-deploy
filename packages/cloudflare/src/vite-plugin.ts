import { cloudflare as cloudflarePlugin } from "@cloudflare/vite-plugin";
import {
  createPrerenderPlugin,
  VITE_ENVIRONMENT_NAMES,
} from "@vite-deploy/internal-helpers";
import { rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import type { Plugin } from "vite";
import type { Options } from "./types.js";
import packageJson from "../package.json" with { type: "json" };

const PACKAGE_NAME = packageJson.name;

export function cloudflare({ config, ...userOptions }: Options): Array<Plugin> {
  return [
    ...cloudflarePlugin({
      ...config,
      viteEnvironment: { name: VITE_ENVIRONMENT_NAMES.server },
    }),
    ...createPrerenderPlugin({
      userOptions,
      // TODO: check how static projects should be structured on cloudflare
      onStaticBuildDone: async ({ clientOutDir }) => {
        const distDir = dirname(clientOutDir);
        const tempDir = `${distDir}_tmp`;
        await rename(clientOutDir, tempDir);
        await rm(distDir, { force: true, recursive: true });
        await rename(tempDir, distDir);
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
