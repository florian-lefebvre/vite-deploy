import { createRequest, sendResponse } from "@remix-run/node-fetch-server";
import {
  createBuildPlugin,
  createHandlerPlugin,
  createPrerenderPlugin,
  VITE_ENVIRONMENT_NAMES,
} from "@vite-deploy/internal-helpers";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type Plugin } from "vite";
import packageJson from "../package.json" with { type: "json" };
import type { ExportedHandler, Options } from "./types.js";

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

function configPlugin(options: Pick<Options, "handlerEntrypoint">): Plugin {
  return {
    name: `${PACKAGE_NAME}:config`,
    sharedDuringBuild: true,
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
            outDir: ".vercel/output/static",
          },
        };
      }
      if (name === VITE_ENVIRONMENT_NAMES.server) {
        return {
          build: {
            outDir: ".vercel/output/render.func",
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
      handler(_id, ...args) {
        return this.resolve(options.handlerEntrypoint.toString(), ...args);
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
    configPlugin({ handlerEntrypoint }),
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
          request = createRequest(req, res);
          const response = await mod.default.fetch(request);
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
        const serverOutDir = join(
          serverEnvironment.config.root,
          serverEnvironment.config.build.outDir,
        );

        await writeFile(
          join(serverOutDir, "../config.json"),
          JSON.stringify({ version: 3 }),
          "utf-8",
        );

        if (output === "static") {
          await rm(serverOutDir, {
            force: true,
            recursive: true,
          });
          return;
        }

        await Promise.all([
          writeFile(
            join(serverOutDir, "package.json"),
            JSON.stringify({ type: "module" }),
            "utf-8",
          ),
          writeFile(
            join(serverOutDir, ".vc-config.json"),
            JSON.stringify({
              runtime: "nodejs",
              handler: `${MAIN_INPUT}.mjs`,
              launcherType: "Nodejs",
              supportsResponseStreaming: true,
            }),
            "utf-8",
          ),
        ]);
      },
    }),
  ];
}
